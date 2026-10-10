from typing import Any

from accounts.models import User
from audit.models import ActivityLog, LogCategory
from care.models import Patient


def log_event(
    event_type: str,
    *,
    actor: User | None = None,
    patient: Patient | None = None,
    category: str = LogCategory.ACTIVITY,
    **data: Any,
) -> ActivityLog:
    """Record an activity or audit event. Callers pass identifiers and labels only, never raw sensitive content."""
    actor_obj = actor if actor is not None and actor.is_authenticated else None
    return ActivityLog.objects.create(
        event_type=event_type, actor=actor_obj, patient=patient, category=category, event_data=data
    )
