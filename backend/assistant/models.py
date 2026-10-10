from django.db import models

from core.models import UUIDModel


class AssistantSession(UUIDModel):
    """An assistant conversation (DB spec `assistant_sessions`); holds the recognised-person context."""

    patient = models.ForeignKey("care.Patient", on_delete=models.CASCADE, related_name="assistant_sessions")
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    mode = models.CharField(max_length=10, default="TEXT")
    context_person = models.ForeignKey(
        "people.Person", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
