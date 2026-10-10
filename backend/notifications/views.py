from typing import Any
from uuid import UUID

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.service import log_event
from core.permissions import IsCaregiver, IsPatientOrCaregiver, user_of
from core.scope import accessible_patients, resolve_owned, resolve_patient
from notifications.models import Alert, Device


class AlertSerializer(serializers.ModelSerializer):
    patient_id = serializers.UUIDField(read_only=True)
    patient_name = serializers.CharField(source="patient.display_name", read_only=True)
    acknowledged_by_name = serializers.CharField(source="acknowledged_by.name", default=None, read_only=True)

    class Meta:
        model = Alert
        fields = [
            "id",
            "patient_id",
            "patient_name",
            "type",
            "severity",
            "message",
            "data",
            "created_at",
            "acknowledged_at",
            "acknowledged_by_name",
        ]
        read_only_fields = fields


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["expo_push_token", "platform"]
        extra_kwargs: dict[str, dict[str, Any]] = {"expo_push_token": {"validators": []}}

    def validate_expo_push_token(self, value: str) -> str:
        if not (value.startswith("ExponentPushToken[") or value.startswith("ExpoPushToken[")):
            raise serializers.ValidationError("Not an Expo push token.")
        return value


_UNACK = OpenApiParameter("unacknowledged", bool, description="Only alerts not yet acknowledged")


def _filter(request: Request, alerts: QuerySet[Alert]) -> QuerySet[Alert]:
    if request.query_params.get("unacknowledged") in {"1", "true"}:
        alerts = alerts.filter(acknowledged_at__isnull=True)
    return alerts.select_related("patient", "acknowledged_by")[:100]


@extend_schema(tags=["alerts"])
class MyAlertsView(APIView):
    """All alerts across a caregiver's patients; polled by the caregiver app (ADR-0008)."""

    permission_classes = [IsCaregiver]

    @extend_schema(parameters=[_UNACK], responses=AlertSerializer(many=True))
    def get(self, request: Request) -> Response:
        alerts = Alert.objects.filter(patient__in=accessible_patients(user_of(request)))
        return Response(AlertSerializer(_filter(request, alerts), many=True).data)


@extend_schema(tags=["alerts"])
class PatientAlertsView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(parameters=[_UNACK], responses=AlertSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        return Response(AlertSerializer(_filter(request, Alert.objects.filter(patient=patient)), many=True).data)


@extend_schema(tags=["alerts"])
class AlertAcknowledgeView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=None, responses=AlertSerializer)
    def post(self, request: Request, alert_id: UUID) -> Response:
        alert = get_object_or_404(Alert, pk=alert_id)
        user = user_of(request)
        patient = resolve_owned(user, alert.patient_id)
        if alert.acknowledged_at is None:
            alert.acknowledged_at = timezone.now()
            alert.acknowledged_by = user
            alert.save(update_fields=["acknowledged_at", "acknowledged_by"])
            log_event("alert.acknowledged", actor=user, patient=patient, alert_type=alert.type)
        return Response(AlertSerializer(alert).data)


@extend_schema(tags=["devices"])
class DeviceRegisterView(APIView):
    """Register this phone's Expo push token for the signed-in user."""

    @extend_schema(request=DeviceSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Device.objects.update_or_create(
            expo_push_token=serializer.validated_data["expo_push_token"],
            defaults={"user": user_of(request), "platform": serializer.validated_data.get("platform", "")},
        )
        return Response(status=status.HTTP_201_CREATED)

    @extend_schema(request=DeviceSerializer, responses={204: None})
    def delete(self, request: Request) -> Response:
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Device.objects.filter(
            user=user_of(request), expo_push_token=serializer.validated_data["expo_push_token"]
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
