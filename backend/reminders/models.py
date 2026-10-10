from datetime import datetime

from django.conf import settings
from django.db import models

from core.models import UUIDModel


class ReminderType(models.TextChoices):
    MEDICATION = "MEDICATION", "Medication"
    APPOINTMENT = "APPOINTMENT", "Appointment"
    ROUTINE = "ROUTINE", "Routine"
    OTHER = "OTHER", "Other"


class ReminderStatus(models.TextChoices):
    """Lifecycle of one reminder occurrence (UI/UX reminder flow).

    Delivery happens through notifications scheduled on the patient's device, so the server does not
    claim a reminder was "sent"; it records what the patient did: acknowledged, snoozed, or missed.
    """

    PENDING = "PENDING", "Upcoming"
    SNOOZED = "SNOOZED", "Snoozed"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
    MISSED = "MISSED", "Missed"


class Reminder(UUIDModel):
    """One reminder occurrence (DB spec `reminders`), generated from a routine, medication schedule or appointment."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="reminders")
    type = models.CharField(max_length=20, choices=ReminderType.choices)
    source_id = models.UUIDField(help_text="Routine, MedicationSchedule or Appointment id.")
    scheduled_at = models.DateTimeField()
    message = models.CharField(max_length=255)
    detail = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=ReminderStatus.choices, default=ReminderStatus.PENDING)
    snoozed_until = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    acknowledged_late = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["scheduled_at"]
        constraints = [
            models.UniqueConstraint(fields=["type", "source_id", "scheduled_at"], name="unique_reminder_occurrence")
        ]
        indexes = [models.Index(fields=["patient", "scheduled_at", "status"], name="reminder_patient_time_status")]

    @property
    def due_at(self) -> datetime:
        """When the reminder should next fire: the snooze time if snoozed, else the scheduled time."""
        return self.snoozed_until if self.status == ReminderStatus.SNOOZED and self.snoozed_until else self.scheduled_at
