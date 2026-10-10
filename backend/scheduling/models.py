from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class Priority(models.TextChoices):
    LOW = "LOW", "Low"
    NORMAL = "NORMAL", "Normal"
    HIGH = "HIGH", "High"


class Routine(TimeStampedModel):
    """Recurring daily activity (DB spec `daily_schedules`, SCH-01)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="routines")
    title = models.CharField(max_length=180)
    notes = models.TextField(blank=True)
    scheduled_time = models.TimeField()
    recurrence_rule = models.CharField(max_length=255, default="FREQ=DAILY")
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    reminder_enabled = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["scheduled_time", "title"]


class Appointment(TimeStampedModel):
    """Calendar appointment (DB spec `appointments`, SCH-03)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="appointments")
    title = models.CharField(max_length=180)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["start_at"]
        indexes = [models.Index(fields=["patient", "start_at"], name="appointment_patient_start")]


class Medication(TimeStampedModel):
    """Medication master record (DB spec `medications`, MED-01/02). Never changed by AI (MED-05)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="medications")
    name = models.CharField(max_length=160)
    dosage_text = models.CharField(max_length=160, blank=True)
    instructions = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["name"]


class MedicationSchedule(TimeStampedModel):
    """When a medication is taken (DB spec `medication_schedules`)."""

    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name="schedules")
    time_of_day = models.TimeField()
    recurrence_rule = models.CharField(max_length=255, default="FREQ=DAILY")
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["time_of_day"]
        indexes = [models.Index(fields=["medication", "time_of_day"], name="medschedule_med_time")]
