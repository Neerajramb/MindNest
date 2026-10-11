from django.conf import settings
from django.db import models

from core.models import UUIDModel


class AlertType(models.TextChoices):
    GEOFENCE = "GEOFENCE", "Left a safe zone"
    MEDICATION = "MEDICATION", "Missed medication"
    SOS = "SOS", "Help requested"
    LOCATION_UNAVAILABLE = "LOCATION_UNAVAILABLE", "Location unavailable"
    PATIENT_REMINDER = "PATIENT_REMINDER", "Added a reminder"
    SYSTEM = "SYSTEM", "System"
    OTHER = "OTHER", "Other"


class Severity(models.TextChoices):
    INFO = "INFO", "Info"
    WARNING = "WARNING", "Warning"
    HIGH = "HIGH", "High"


class Alert(UUIDModel):
    """Caregiver-facing safety or important event (DB spec `alerts`, FR-022, FR-025)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="alerts")
    type = models.CharField(max_length=30, choices=AlertType.choices)
    severity = models.CharField(max_length=10, choices=Severity.choices)
    message = models.TextField()
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["patient", "-created_at", "acknowledged_at"], name="alert_patient_time_ack")]


class Device(UUIDModel):
    """A signed-in phone that can receive Expo push notifications."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    expo_push_token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)


class DeliveryStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SENT = "SENT", "Accepted by push service"
    FAILED = "FAILED", "Failed"
    NO_DEVICE = "NO_DEVICE", "No registered device (in-app only)"


class Notification(UUIDModel):
    """Outbox entry for one recipient (SRS section 7: persist pending notifications and retry)."""

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="+")
    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=255)
    status = models.CharField(max_length=12, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=255, blank=True)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "next_attempt_at"], name="notification_outbox")]
