from uuid import UUID

from django.db.models import QuerySet
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.generics import ListAPIView

from audit.models import ActivityLog, LogCategory
from core.permissions import IsCaregiver, IsPatientOrCaregiver, user_of
from core.scope import resolve_patient


class ActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.name", default=None, read_only=True)
    actor_role = serializers.CharField(source="actor.role", default=None, read_only=True)

    class Meta:
        model = ActivityLog
        fields = ["id", "category", "event_type", "event_data", "actor_name", "actor_role", "created_at"]
        read_only_fields = fields


@extend_schema(tags=["activity"])
class PatientActivityView(ListAPIView):
    """Patient-facing and caregiver-facing activity history (CARE-06, FR-024)."""

    permission_classes = [IsPatientOrCaregiver]
    serializer_class = ActivityLogSerializer
    category = LogCategory.ACTIVITY

    def get_queryset(self) -> QuerySet[ActivityLog]:
        patient_id: UUID = self.kwargs["patient_id"]
        patient = resolve_patient(user_of(self.request), patient_id)
        return ActivityLog.objects.filter(patient=patient, category=self.category).select_related("actor")


@extend_schema(tags=["activity"])
class PatientAuditView(PatientActivityView):
    """Security and configuration events; caregivers only."""

    permission_classes = [IsCaregiver]
    category = LogCategory.AUDIT
