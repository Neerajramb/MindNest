from typing import Any
from uuid import UUID

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ai.face import FaceEngine, FaceModelsMissing, get_face_engine
from audit.models import LogCategory
from audit.service import log_event
from core.exceptions import ServiceUnavailable
from core.media import read_image
from core.permissions import IsCaregiver, IsPatient, IsPatientOrCaregiver, user_of
from core.scope import own_patient, resolve_owned, resolve_patient
from people.models import Person
from people.service import enrol_face, recognize


class PersonSerializer(serializers.ModelSerializer):
    face_count = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = ["id", "name", "relationship", "notes", "consent_confirmed", "face_count", "created_at"]
        read_only_fields = ["id", "face_count", "created_at"]

    def get_face_count(self, person: Person) -> int:
        return person.face_embeddings.count()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        consent = attrs.get("consent_confirmed", getattr(self.instance, "consent_confirmed", False))
        if not consent:
            raise ValidationError({"consent_confirmed": "Confirm that this person agreed to face recognition."})
        return attrs


class ImageUploadSerializer(serializers.Serializer):
    image = serializers.FileField()


def _engine() -> FaceEngine:
    try:
        return get_face_engine()
    except FaceModelsMissing as exc:
        raise ServiceUnavailable("Face recognition is not set up on the server yet.") from exc


@extend_schema(tags=["people"])
class PersonListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=PersonSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        people = Person.objects.filter(patient=patient, is_active=True)
        return Response(PersonSerializer(people, many=True).data)

    @extend_schema(request=PersonSerializer, responses={201: PersonSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        user = user_of(request)
        patient = resolve_patient(user, patient_id, write=True)
        serializer = PersonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        person = serializer.save(patient=patient, created_by=user)
        log_event("person.registered", actor=user, patient=patient, category=LogCategory.AUDIT, person=person.name)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["people"])
class PersonDetailView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=PersonSerializer, responses=PersonSerializer)
    def patch(self, request: Request, person_id: UUID) -> Response:
        person = get_object_or_404(Person, pk=person_id, is_active=True)
        resolve_owned(user_of(request), person.patient_id, write=True)
        serializer = PersonSerializer(person, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    @transaction.atomic
    def delete(self, request: Request, person_id: UUID) -> Response:
        """Revoke: deactivate the profile and permanently delete its face data (DB spec section 8, PEO-04)."""
        person = get_object_or_404(Person, pk=person_id, is_active=True)
        user = user_of(request)
        patient = resolve_owned(user, person.patient_id, write=True)
        person.face_embeddings.all().delete()
        person.is_active = False
        person.save(update_fields=["is_active", "updated_at"])
        log_event("person.revoked", actor=user, patient=patient, category=LogCategory.AUDIT, person=person.name)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["people"])
class FaceEnrolView(APIView):
    """Caregiver adds a face photo for a registered person. The photo is discarded after processing."""

    permission_classes = [IsCaregiver]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    @extend_schema(request={"multipart/form-data": ImageUploadSerializer}, responses={201: PersonSerializer})
    def post(self, request: Request, person_id: UUID) -> Response:
        person = get_object_or_404(Person, pk=person_id, is_active=True)
        user = user_of(request)
        patient = resolve_owned(user, person.patient_id, write=True)
        rgb = read_image(request.FILES.get("image"))
        enrol_face(_engine(), person, rgb)
        log_event("person.face_added", actor=user, patient=patient, category=LogCategory.AUDIT, person=person.name)
        return Response(PersonSerializer(person).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["people"])
class FaceRecognizeView(APIView):
    """P-04 "Who is this?" for the signed-in patient. Only that patient's registered people are compared."""

    permission_classes = [IsPatient]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    @extend_schema(request={"multipart/form-data": ImageUploadSerializer})
    def post(self, request: Request) -> Response:
        user = user_of(request)
        patient = own_patient(user)
        rgb = read_image(request.FILES.get("image"))
        result = recognize(_engine(), patient, rgb)
        log_event(
            "face.recognition",
            actor=user,
            patient=patient,
            result=result.status,
            person=result.person.name if result.person else None,
        )
        return Response(result.as_dict())
