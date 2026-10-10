import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    PATIENT = "PATIENT", "Patient"
    CAREGIVER = "CAREGIVER", "Caregiver"
    ADMIN = "ADMIN", "Admin"


class User(AbstractUser):
    """Login account (DB spec `users`). Role decides which app shell and endpoints are available."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    email = models.EmailField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    updated_at = models.DateTimeField(auto_now=True)

    REQUIRED_FIELDS = ["name", "role"]

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["email"], condition=~models.Q(email=""), name="unique_nonblank_email"),
        ]

    @property
    def is_patient(self) -> bool:
        return self.role == Role.PATIENT

    @property
    def is_caregiver(self) -> bool:
        return self.role == Role.CAREGIVER
