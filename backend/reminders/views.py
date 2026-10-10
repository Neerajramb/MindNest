from datetime import datetime, timedelta
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsPatient, IsPatientOrCaregiver, user_of
from core.scope import own_patient, resolve_patient
from reminders.models import Reminder, ReminderStatus
from reminders.service import acknowledge, materialize_for_patient, snooze

MAX_WINDOW = timedelta(days=14)


class ReminderSerializer(serializers.ModelSerializer):
    due_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Reminder
        fields = [
            "id",
            "type",
            "source_id",
            "scheduled_at",
            "due_at",
            "message",
            "detail",
            "status",
            "snoozed_until",
            "acknowledged_at",
            "acknowledged_late",
        ]
        read_only_fields = fields


class SnoozeSerializer(serializers.Serializer):
    minutes = serializers.IntegerField(default=10)


def _parse_bound(request: Request, name: str, default: datetime) -> datetime:
    raw = request.query_params.get(name)
    if not raw:
        return default
    value = parse_datetime(raw)
    if value is None or value.tzinfo is None:
        raise ValidationError({name: "Use an ISO 8601 date-time with a timezone."})
    return value


@extend_schema(tags=["reminders"])
class ReminderListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(
        parameters=[
            OpenApiParameter("from", datetime, description="Default: 24 hours ago"),
            OpenApiParameter("to", datetime, description="Default: 48 hours ahead"),
            OpenApiParameter("status", str, description="Filter by status"),
        ],
        responses=ReminderSerializer(many=True),
    )
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        now = timezone.now()
        start = _parse_bound(request, "from", now - timedelta(hours=24))
        end = _parse_bound(request, "to", now + timedelta(hours=48))
        if end < start or end - start > MAX_WINDOW:
            raise ValidationError({"to": "The range must be positive and at most 14 days."})
        # Idempotent: keeps the window filled even if the background worker is not running.
        materialize_for_patient(patient, now=now)
        reminders = Reminder.objects.filter(patient=patient, scheduled_at__gte=start, scheduled_at__lte=end)
        status_filter = request.query_params.get("status")
        if status_filter:
            if status_filter not in ReminderStatus.values:
                raise ValidationError({"status": "Unknown status."})
            reminders = reminders.filter(status=status_filter)
        return Response(ReminderSerializer(reminders, many=True).data)


def _own_reminder(request: Request, reminder_id: UUID) -> Reminder:
    reminder = get_object_or_404(Reminder.objects.select_related("patient"), pk=reminder_id)
    if reminder.patient_id != own_patient(user_of(request)).id:
        raise NotFound()
    return reminder


@extend_schema(tags=["reminders"])
class ReminderAcknowledgeView(APIView):
    """Patient confirms a reminder (SCH-05, MED-04). Records patient-reported status only, not ingestion."""

    permission_classes = [IsPatient]

    @extend_schema(request=None, responses=ReminderSerializer)
    def post(self, request: Request, reminder_id: UUID) -> Response:
        reminder = acknowledge(_own_reminder(request, reminder_id), user_of(request))
        return Response(ReminderSerializer(reminder).data)


@extend_schema(tags=["reminders"])
class ReminderSnoozeView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(request=SnoozeSerializer, responses=ReminderSerializer)
    def post(self, request: Request, reminder_id: UUID) -> Response:
        serializer = SnoozeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reminder = snooze(_own_reminder(request, reminder_id), user_of(request), serializer.validated_data["minutes"])
        return Response(ReminderSerializer(reminder).data)
