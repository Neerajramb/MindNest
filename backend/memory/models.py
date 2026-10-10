import numpy as np
from django.conf import settings
from django.db import models

from core.models import UUIDModel


class ConversationSource(models.TextChoices):
    VOICE = "VOICE", "Recorded conversation"
    TEXT = "TEXT", "Typed note"


class Retention(models.TextChoices):
    ACTIVE = "ACTIVE", "Kept"
    RETIRED = "RETIRED", "Deleted"


class Conversation(UUIDModel):
    """A recorded or typed conversation (DB spec `conversations`). Raw audio is never stored."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="conversations")
    recognized_person = models.ForeignKey(
        "people.Person", on_delete=models.SET_NULL, null=True, blank=True, related_name="conversations"
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=10, choices=ConversationSource.choices)
    retention_status = models.CharField(max_length=10, choices=Retention.choices, default=Retention.ACTIVE)
    consent_confirmed = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["patient", "-started_at"], name="conversation_patient_time")]


class Speaker(models.TextChoices):
    PATIENT = "PATIENT", "Patient"
    PERSON = "PERSON", "Other person"
    SYSTEM = "SYSTEM", "System"


class ConversationMessage(UUIDModel):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    speaker_type = models.CharField(max_length=10, choices=Speaker.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position"]


class Memory(UUIDModel):
    """Searchable memory chunk with its vector (DB spec `memories`; vector kept with the row, ADR-0004)."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="memories")
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="memories")
    recognized_person = models.ForeignKey(
        "people.Person", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    content = models.TextField()
    vector = models.BinaryField()
    event_time = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["patient", "-event_time"], name="memory_patient_time"),
            models.Index(fields=["patient", "recognized_person"], name="memory_patient_person"),
        ]

    def as_array(self) -> np.ndarray:
        return np.frombuffer(bytes(self.vector), dtype=np.float32)
