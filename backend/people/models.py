import numpy as np
from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel


class Person(TimeStampedModel):
    """Familiar person registered for a patient (DB spec `people`, PEO-01..04)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="people")
    name = models.CharField(max_length=120)
    relationship = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    consent_confirmed = models.BooleanField(
        default=False, help_text="Caregiver confirmed this person agreed to face recognition."
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["name"]


class FaceEmbedding(UUIDModel):
    """Recognition representation (DB spec `face_embeddings`). The photo itself is never stored."""

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="face_embeddings")
    vector = models.BinaryField()
    model_name = models.CharField(max_length=120)
    model_version = models.CharField(max_length=60, blank=True)
    quality_score = models.DecimalField(max_digits=5, decimal_places=3, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def as_array(self) -> np.ndarray:
        return np.frombuffer(bytes(self.vector), dtype=np.float32)
