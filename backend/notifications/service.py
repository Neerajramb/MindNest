import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from audit.service import log_event
from care.models import Patient
from notifications.models import Alert, DeliveryStatus, Device, Notification
from notifications.push import PushError, send_expo_push

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5


def caregivers_of(patient: Patient) -> list[User]:
    return list(
        User.objects.filter(
            caregiver_profile__patient_links__patient=patient,
            caregiver_profile__patient_links__is_active=True,
            is_active=True,
        ).distinct()
    )


def create_alert(
    patient: Patient,
    alert_type: str,
    severity: str,
    message: str,
    *,
    data: dict[str, Any] | None = None,
    actor: User | None = None,
) -> Alert:
    """Create an alert and queue a notification for every active caregiver of the patient."""
    alert = Alert.objects.create(patient=patient, type=alert_type, severity=severity, message=message, data=data or {})
    title = f"{patient.preferred_name or patient.display_name}: {alert.get_type_display()}"
    now = timezone.now()
    Notification.objects.bulk_create(
        [
            Notification(
                recipient=user, patient=patient, alert=alert, title=title[:120], body=message[:255], next_attempt_at=now
            )
            for user in caregivers_of(patient)
        ]
    )
    log_event("alert.created", actor=actor, patient=patient, alert_type=alert_type, severity=severity)

    def _deliver() -> None:
        from notifications.tasks import deliver_notifications_task

        deliver_notifications_task()

    transaction.on_commit(_deliver)
    return alert


def deliver_pending(
    *, now: datetime | None = None, sender: Callable[..., list[str]] = send_expo_push, limit: int = 100
) -> int:
    """Try to deliver due outbox entries. Returns how many were accepted by the push service."""
    now = now or timezone.now()
    delivered = 0
    due = Notification.objects.filter(status=DeliveryStatus.PENDING, next_attempt_at__lte=now).order_by(
        "next_attempt_at"
    )[:limit]
    for notification in due:
        tokens = list(
            Device.objects.filter(user_id=notification.recipient_id).values_list("expo_push_token", flat=True)
        )
        if not tokens:
            notification.status = DeliveryStatus.NO_DEVICE
            notification.save(update_fields=["status"])
            continue
        data = {"alert_id": str(notification.alert_id), "patient_id": str(notification.patient_id)}
        try:
            unregistered = sender(tokens, notification.title, notification.body, data)
        except PushError as exc:
            notification.attempts += 1
            notification.last_error = str(exc)[:255]
            if notification.attempts >= MAX_ATTEMPTS:
                notification.status = DeliveryStatus.FAILED
            else:
                notification.next_attempt_at = now + timedelta(minutes=2**notification.attempts)
            notification.save(update_fields=["attempts", "last_error", "status", "next_attempt_at"])
            logger.warning("Push delivery failed (attempt %s)", notification.attempts)
            continue
        Device.objects.filter(expo_push_token__in=unregistered).delete()
        notification.status = DeliveryStatus.SENT
        notification.sent_at = now
        notification.attempts += 1
        notification.save(update_fields=["status", "sent_at", "attempts"])
        delivered += 1
    return delivered
