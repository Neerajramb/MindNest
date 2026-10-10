from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel


class Geofence(TimeStampedModel):
    """Caregiver-defined safe zone: centre and radius (DB spec `geofences`, SAFE-01)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="geofences")
    name = models.CharField(max_length=120)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    radius_m = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["name"]


class LocationSource(models.TextChoices):
    GPS = "GPS", "GPS"
    NETWORK = "NETWORK", "Network"
    TEST = "TEST", "Simulated (test)"


class Location(UUIDModel):
    """One location report (DB spec `locations`). Retained for LOCATION_RETENTION_DAYS, then purged."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="locations")
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy_m = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True)
    recorded_at = models.DateTimeField()
    source = models.CharField(max_length=10, choices=LocationSource.choices)
    is_mocked = models.BooleanField(default=False, help_text="Device reported a mock/simulated GPS provider.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]
        indexes = [models.Index(fields=["patient", "-recorded_at"], name="location_patient_time")]


class ZoneStatus(models.TextChoices):
    UNKNOWN = "UNKNOWN", "Unknown"
    INSIDE = "INSIDE", "Inside a safe zone"
    OUTSIDE = "OUTSIDE", "Outside all safe zones"


class SafetyState(models.Model):
    """Last evaluated geofence state per patient, so alerts fire on transitions rather than every report."""

    patient = models.OneToOneField("care.Patient", on_delete=models.CASCADE, primary_key=True, related_name="safety")
    status = models.CharField(max_length=10, choices=ZoneStatus.choices, default=ZoneStatus.UNKNOWN)
    zone = models.ForeignKey(Geofence, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    changed_at = models.DateTimeField(null=True, blank=True)
    last_location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    stale_alerted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.patient_id}: {self.status}"
