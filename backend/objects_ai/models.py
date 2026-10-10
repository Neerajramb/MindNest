from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel


class Place(TimeStampedModel):
    """A room or spot in the patient's home; indoor "location" for object observations (GPS is useless indoors)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="places")
    name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]


class TrackedObject(TimeStampedModel):
    """An everyday belonging the patient may look for (DB spec `objects`)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="tracked_objects")
    name = models.CharField(max_length=100, help_text="Lowercase label, e.g. 'keys'.")
    aliases = models.CharField(max_length=255, blank=True, help_text="Comma-separated other names, e.g. 'car keys'.")
    category = models.CharField(max_length=80, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def all_names(self) -> list[str]:
        names = [self.name, *[a.strip() for a in self.aliases.split(",")]]
        return [n.lower() for n in names if n.strip()]


class ObservationSource(models.TextChoices):
    VISION = "VISION", "Camera scan"
    MANUAL = "MANUAL", "Entered by hand"


class ObjectObservation(UUIDModel):
    """Where and when an object was seen (DB spec `object_observations`). Never a guaranteed current location."""

    tracked_object = models.ForeignKey(TrackedObject, on_delete=models.CASCADE, related_name="observations")
    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="+")
    place = models.ForeignKey(Place, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    location_label = models.CharField(max_length=160, blank=True)
    observed_at = models.DateTimeField()
    confidence = models.DecimalField(max_digits=4, decimal_places=3, null=True)
    source = models.CharField(max_length=10, choices=ObservationSource.choices)
    scan_id = models.UUIDField(null=True, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-observed_at"]
        indexes = [models.Index(fields=["tracked_object", "-observed_at"], name="observation_object_time")]
