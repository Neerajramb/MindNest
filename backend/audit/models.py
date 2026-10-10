from django.conf import settings
from django.db import models

from core.models import UUIDModel


class LogCategory(models.TextChoices):
    ACTIVITY = "ACTIVITY", "Activity"
    AUDIT = "AUDIT", "Security/configuration"


class ActivityLog(UUIDModel):
    """Activity and audit history (DB spec `activity_logs`, NFR-008). Never stores sensitive content."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.CharField(max_length=10, choices=LogCategory.choices, default=LogCategory.ACTIVITY)
    event_type = models.CharField(max_length=80)
    event_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["patient", "-created_at"], name="activity_patient_time")]
