from typing import Any
from uuid import UUID

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import LogCategory
from audit.service import log_event
from care.models import Caregiver, CaregiverPatient, EmergencyContact, PermissionLevel
from care.serializers import (
    AddCaregiverSerializer,
    CaregiverLinkSerializer,
    EmergencyContactSerializer,
    LinkCodeSerializer,
    PatientCreateSerializer,
    PatientSelfSettingsSerializer,
    PatientSerializer,
)
from care.services import create_patient_for_caregiver, issue_link_code
from core.permissions import IsCaregiver, IsPatient, IsPatientOrCaregiver, user_of
from core.scope import accessible_patients, own_patient, resolve_owned, resolve_patient


def _levels_for(user: Any) -> dict[Any, str]:
    links = CaregiverPatient.objects.filter(caregiver__user=user, is_active=True).values_list(
        "patient_id", "permission_level"
    )
    return dict(links)


@extend_schema(tags=["patients"])
class PatientListCreateView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(responses=PatientSerializer(many=True))
    def get(self, request: Request) -> Response:
        patients = accessible_patients(user_of(request)).order_by("display_name")
        context = {"levels": _levels_for(user_of(request))}
        return Response(PatientSerializer(patients, many=True, context=context).data)

    @extend_schema(request=PatientCreateSerializer, responses={201: PatientSerializer})
    def post(self, request: Request) -> Response:
        serializer = PatientCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        patient, code = create_patient_for_caregiver(user_of(request), **serializer.validated_data)
        log_event("patient.created", actor=user_of(request), patient=patient, category=LogCategory.AUDIT)
        data = PatientSerializer(patient, context={"levels": {patient.id: PermissionLevel.PRIMARY}}).data
        data["link_code"] = LinkCodeSerializer(code).data
        return Response(data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["patients"])
class PatientMeView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(responses=PatientSerializer)
    def get(self, request: Request) -> Response:
        return Response(PatientSerializer(own_patient(user_of(request))).data)


@extend_schema(tags=["patients"])
class PatientMeSettingsView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(request=PatientSelfSettingsSerializer, responses=PatientSerializer)
    def patch(self, request: Request) -> Response:
        patient = own_patient(user_of(request))
        serializer = PatientSelfSettingsSerializer(patient, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_event("patient.settings_changed", actor=user_of(request), patient=patient, fields=sorted(request.data))
        return Response(PatientSerializer(patient).data)


@extend_schema(tags=["patients"])
class PatientDetailView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=PatientSerializer)
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        return Response(PatientSerializer(patient, context={"levels": _levels_for(user_of(request))}).data)

    @extend_schema(request=PatientSerializer, responses=PatientSerializer)
    def patch(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, write=True)
        serializer = PatientSerializer(
            patient, data=request.data, partial=True, context={"levels": _levels_for(user_of(request))}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_event(
            "patient.updated",
            actor=user_of(request),
            patient=patient,
            category=LogCategory.AUDIT,
            fields=sorted(request.data),
        )
        return Response(serializer.data)


@extend_schema(tags=["patients"])
class LinkCodeCreateView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=None, responses={201: LinkCodeSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, min_level=PermissionLevel.PRIMARY)
        if patient.user_id is not None:
            raise ValidationError({"patient": "This patient already has an account."})
        code = issue_link_code(patient, user_of(request))
        log_event("patient.link_code_issued", actor=user_of(request), patient=patient, category=LogCategory.AUDIT)
        return Response(LinkCodeSerializer(code).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["patients"])
class PatientCaregiversView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=CaregiverLinkSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        links = patient.caregiver_links.filter(is_active=True).select_related("caregiver__user")
        return Response(CaregiverLinkSerializer(links, many=True).data)

    @extend_schema(request=AddCaregiverSerializer, responses={201: CaregiverLinkSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, min_level=PermissionLevel.PRIMARY)
        serializer = AddCaregiverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        caregiver = Caregiver.objects.get(user=serializer.validated_data["username"])
        link, created = CaregiverPatient.objects.update_or_create(
            caregiver=caregiver,
            patient=patient,
            defaults={"permission_level": serializer.validated_data["permission_level"], "is_active": True},
        )
        if not created and link.permission_level == PermissionLevel.PRIMARY:
            raise ValidationError({"username": "This caregiver is already the primary caregiver."})
        log_event(
            "patient.caregiver_authorized",
            actor=user_of(request),
            patient=patient,
            category=LogCategory.AUDIT,
            caregiver_id=str(caregiver.id),
            level=link.permission_level,
        )
        return Response(CaregiverLinkSerializer(link).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["patients"])
class PatientCaregiverRevokeView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(responses={204: None})
    @transaction.atomic
    def delete(self, request: Request, patient_id: UUID, caregiver_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, min_level=PermissionLevel.PRIMARY)
        link = get_object_or_404(CaregiverPatient, patient=patient, caregiver_id=caregiver_id, is_active=True)
        if link.permission_level == PermissionLevel.PRIMARY:
            raise ValidationError({"caregiver": "The primary caregiver cannot be removed."})
        link.is_active = False
        link.save(update_fields=["is_active"])
        log_event(
            "patient.caregiver_revoked",
            actor=user_of(request),
            patient=patient,
            category=LogCategory.AUDIT,
            caregiver_id=str(caregiver_id),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["patients"])
class CaregiverMeView(APIView):
    permission_classes = [IsCaregiver]

    def get(self, request: Request) -> Response:
        caregiver = get_object_or_404(Caregiver, user=user_of(request))
        return Response(
            {
                "id": str(caregiver.id),
                "name": user_of(request).name,
                "username": user_of(request).username,
                "patient_count": accessible_patients(user_of(request)).count(),
            }
        )


@extend_schema(tags=["emergency"])
class EmergencyContactListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=EmergencyContactSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        return Response(EmergencyContactSerializer(patient.emergency_contacts.all(), many=True).data)

    @extend_schema(request=EmergencyContactSerializer, responses={201: EmergencyContactSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, write=True)
        serializer = EmergencyContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(patient=patient)
        log_event("emergency_contact.created", actor=user_of(request), patient=patient, category=LogCategory.AUDIT)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["emergency"])
class EmergencyContactDetailView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=EmergencyContactSerializer, responses=EmergencyContactSerializer)
    def patch(self, request: Request, contact_id: UUID) -> Response:
        contact = get_object_or_404(EmergencyContact, pk=contact_id)
        resolve_owned(user_of(request), contact.patient_id, write=True)
        serializer = EmergencyContactSerializer(contact, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, contact_id: UUID) -> Response:
        contact = get_object_or_404(EmergencyContact, pk=contact_id)
        patient = resolve_owned(user_of(request), contact.patient_id, write=True)
        contact.delete()
        log_event("emergency_contact.deleted", actor=user_of(request), patient=patient, category=LogCategory.AUDIT)
        return Response(status=status.HTTP_204_NO_CONTENT)
