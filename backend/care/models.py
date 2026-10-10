from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel


class MemoryAccess(models.TextChoices):
    """How much of the patient's conversation memory caregivers may see (UI/UX C-12)."""

    NONE = "NONE", "Nothing"
    METADATA = "METADATA", "Dates and people only"
    FULL = "FULL", "Full content"


class Patient(TimeStampedModel):
    """Patient profile (DB spec `patients`).

    `user` is nullable on purpose: a caregiver creates the profile first and the patient's
    account is attached when they register with a link code (ADR-0010).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="patient_profile"
    )
    display_name = models.CharField(max_length=120)
    preferred_name = models.CharField(max_length=60, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    preferred_language = models.CharField(max_length=20, default="en")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    notes = models.TextField(blank=True, help_text="Non-clinical caregiver notes.")
    caregiver_memory_access = models.CharField(
        max_length=10, choices=MemoryAccess.choices, default=MemoryAccess.METADATA
    )
    location_sharing_enabled = models.BooleanField(default=True)
    text_scale = models.DecimalField(max_digits=3, decimal_places=2, default=1.0)
    voice_responses_enabled = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.display_name


class Caregiver(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="caregiver_profile")

    def __str__(self) -> str:
        return self.user.name


class PermissionLevel(models.TextChoices):
    VIEWER = "VIEWER", "Can view"
    EDITOR = "EDITOR", "Can view and edit"
    PRIMARY = "PRIMARY", "Primary caregiver (manages other caregivers)"


PERMISSION_RANK = {PermissionLevel.VIEWER: 1, PermissionLevel.EDITOR: 2, PermissionLevel.PRIMARY: 3}


class CaregiverPatient(UUIDModel):
    """Explicit caregiver-to-patient authorisation (DB spec `caregiver_patient`, BR-01)."""

    caregiver = models.ForeignKey(Caregiver, on_delete=models.CASCADE, related_name="patient_links")
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="caregiver_links")
    permission_level = models.CharField(max_length=10, choices=PermissionLevel.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["caregiver", "patient"], name="unique_caregiver_patient")]


class LinkCode(UUIDModel):
    """One-time code a caregiver gives the patient to register their account (wireframe Register screen)."""

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="link_codes")
    code = models.CharField(max_length=12, unique=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)


class EmergencyContact(TimeStampedModel):
    """Who the patient's Help/Emergency screen offers to call (P-15)."""

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="emergency_contacts")
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=30)
    relationship = models.CharField(max_length=80, blank=True)
    priority = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["priority", "name"]
