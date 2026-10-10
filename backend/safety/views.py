from datetime import timedelta
from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from audit.models import LogCategory
from audit.service import log_event
from care.serializers import EmergencyContactSerializer
from core.permissions import IsCaregiver, IsPatient, IsPatientOrCaregiver, user_of
from core.scope import own_patient, resolve_owned, resolve_patient
from safety.models import Geofence, LocationSource
from safety.service import record_location, reset_state, sos, summarize

MIN_RADIUS_M, MAX_RADIUS_M = 20, 50_000


class GeofenceSerializer(serializers.ModelSerializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-180, max_value=180)
    radius_m = serializers.IntegerField(min_value=MIN_RADIUS_M, max_value=MAX_RADIUS_M)

    class Meta:
        model = Geofence
        fields = ["id", "name", "latitude", "longitude", "radius_m", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class LocationInputSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-90, max_value=90, coerce_to_string=False
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-180, max_value=180, coerce_to_string=False
    )
    accuracy_m = serializers.DecimalField(max_digits=8, decimal_places=1, min_value=0, required=False, allow_null=True)
    recorded_at = serializers.DateTimeField(required=False)
    # DRF removes declared fields from the class, so shadowing Field.source is safe at runtime.
    source = serializers.ChoiceField(choices=LocationSource.choices, default=LocationSource.GPS)  # type: ignore[assignment]
    is_mocked = serializers.BooleanField(default=False)

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        # Phones report more decimal places than we store; round instead of rejecting.
        if hasattr(data, "copy"):
            data = data.copy()
            for key in ("latitude", "longitude"):
                if isinstance(data.get(key), float | int):
                    data[key] = round(float(data[key]), 6)
            if isinstance(data.get("accuracy_m"), float | int):
                data["accuracy_m"] = round(float(data["accuracy_m"]), 1)
        return super().to_internal_value(data)

    def validate_recorded_at(self, value: Any) -> Any:
        now = timezone.now()
        if value > now + timedelta(minutes=2):
            raise serializers.ValidationError("The time cannot be in the future.")
        if value < now - timedelta(hours=24):
            raise serializers.ValidationError("The location report is too old.")
        return value


@extend_schema(tags=["safety"])
class GeofenceListView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(responses=GeofenceSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        return Response(GeofenceSerializer(Geofence.objects.filter(patient=patient, is_active=True), many=True).data)

    @extend_schema(request=GeofenceSerializer, responses={201: GeofenceSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        user = user_of(request)
        patient = resolve_patient(user, patient_id, write=True)
        serializer = GeofenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        zone = serializer.save(patient=patient, created_by=user)
        reset_state(patient)
        log_event("geofence.created", actor=user, patient=patient, category=LogCategory.AUDIT, zone=zone.name)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["safety"])
class GeofenceDetailView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=GeofenceSerializer, responses=GeofenceSerializer)
    def patch(self, request: Request, geofence_id: UUID) -> Response:
        zone = get_object_or_404(Geofence, pk=geofence_id)
        user = user_of(request)
        patient = resolve_owned(user, zone.patient_id, write=True)
        serializer = GeofenceSerializer(zone, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        reset_state(patient)
        log_event("geofence.updated", actor=user, patient=patient, category=LogCategory.AUDIT, zone=zone.name)
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, geofence_id: UUID) -> Response:
        zone = get_object_or_404(Geofence, pk=geofence_id)
        user = user_of(request)
        patient = resolve_owned(user, zone.patient_id, write=True)
        zone.is_active = False
        zone.save(update_fields=["is_active", "updated_at"])
        reset_state(patient)
        log_event("geofence.disabled", actor=user, patient=patient, category=LogCategory.AUDIT, zone=zone.name)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["safety"])
class LocationIngestView(APIView):
    """Location report from the patient's phone, or a simulated one from a caregiver (AC-09 test locations)."""

    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(request=LocationInputSerializer)
    def post(self, request: Request, patient_id: UUID) -> Response:
        user = user_of(request)
        serializer = LocationInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if user.role == Role.CAREGIVER:
            patient = resolve_patient(user, patient_id, write=True)
            if data["source"] != LocationSource.TEST:
                raise PermissionDenied("Caregivers can only submit simulated (TEST) locations.")
        else:
            patient = resolve_patient(user, patient_id)
            if data["source"] == LocationSource.TEST:
                raise ValidationError({"source": "Patients' phones report GPS or NETWORK locations."})
        if not patient.location_sharing_enabled:
            raise ValidationError({"location": "Location sharing is turned off for this patient."})
        data.setdefault("recorded_at", timezone.now())
        record_location(patient, actor=user, **data)
        return Response(summarize(patient).as_dict(), status=status.HTTP_201_CREATED)


@extend_schema(tags=["safety"])
class SafetyStatusView(APIView):
    """Safe-zone state and latest location (P-02 indicator, P-13, C-10). Never says "safe" without a fresh fix."""

    permission_classes = [IsPatientOrCaregiver]

    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        return Response(summarize(patient).as_dict())


@extend_schema(tags=["safety"])
class SosView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(request=None)
    def post(self, request: Request) -> Response:
        user = user_of(request)
        patient = own_patient(user)
        result = sos(patient, user)
        result["emergency_contacts"] = EmergencyContactSerializer(patient.emergency_contacts.all(), many=True).data
        return Response(result, status=status.HTTP_201_CREATED)
