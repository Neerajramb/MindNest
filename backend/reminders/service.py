"""Reminder generation and lifecycle (SCH-04, SCH-05, MED-03, MED-04).

Occurrences are materialised a fixed horizon ahead (default 48 h) so the patient app can schedule them as
local notifications that fire even when the phone is offline. Generation is idempotent: the unique
(type, source_id, scheduled_at) constraint makes re-running it a no-op.
"""

from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import User
from audit.service import log_event
from care.models import Patient
from notifications.models import AlertType, Severity
from notifications.service import create_alert
from reminders.models import Reminder, ReminderStatus, ReminderType
from scheduling.models import Appointment, MedicationSchedule, Routine
from scheduling.recurrence import occurrences_between

# Missed reminders of these types alert caregivers; others are only recorded (UI/UX: "according to configuration").
ALERT_ON_MISSED = {ReminderType.MEDICATION}
SNOOZE_MINUTES_RANGE = (5, 60)
ACTION_WINDOW = timedelta(minutes=60)


def _medication_detail(schedule: MedicationSchedule) -> str:
    med = schedule.medication
    parts = [p for p in (med.dosage_text, med.instructions) if p]
    return " · ".join(parts)[:255]


def materialize_for_patient(patient: Patient, *, now: datetime | None = None, horizon_hours: int | None = None) -> int:
    now = now or timezone.now()
    end = now + timedelta(hours=horizon_hours or settings.REMINDER_HORIZON_HOURS)
    tz = ZoneInfo(patient.timezone)
    pending: list[Reminder] = []

    for routine in Routine.objects.filter(patient=patient, is_active=True, reminder_enabled=True):
        for at in occurrences_between(
            routine.recurrence_rule,
            start_date=routine.start_date,
            end_date=routine.end_date,
            time_of_day=routine.scheduled_time,
            tz=tz,
            window_start=now,
            window_end=end,
        ):
            pending.append(
                Reminder(
                    patient=patient,
                    type=ReminderType.ROUTINE,
                    source_id=routine.id,
                    scheduled_at=at,
                    message=routine.title,
                    detail=routine.notes[:255],
                )
            )

    schedules = MedicationSchedule.objects.filter(
        medication__patient=patient, medication__is_active=True, is_active=True
    ).select_related("medication")
    for schedule in schedules:
        for at in occurrences_between(
            schedule.recurrence_rule,
            start_date=schedule.start_date,
            end_date=schedule.end_date,
            time_of_day=schedule.time_of_day,
            tz=tz,
            window_start=now,
            window_end=end,
        ):
            pending.append(
                Reminder(
                    patient=patient,
                    type=ReminderType.MEDICATION,
                    source_id=schedule.id,
                    scheduled_at=at,
                    message=f"Take {schedule.medication.name}",
                    detail=_medication_detail(schedule),
                )
            )

    lead = timedelta(minutes=settings.APPOINTMENT_REMINDER_LEAD_MINUTES)
    for appointment in Appointment.objects.filter(patient=patient, start_at__gt=now, start_at__lte=end + lead):
        detail = f"At {appointment.location}" if appointment.location else ""
        pending.append(
            Reminder(
                patient=patient,
                type=ReminderType.APPOINTMENT,
                source_id=appointment.id,
                scheduled_at=appointment.start_at - lead,
                message=appointment.title,
                detail=detail,
            )
        )

    before = Reminder.objects.filter(patient=patient).count()
    Reminder.objects.bulk_create(pending, ignore_conflicts=True)
    return Reminder.objects.filter(patient=patient).count() - before


def refresh_source(patient: Patient, source_id: UUID, *, now: datetime | None = None) -> None:
    """Re-generate future reminders after a routine, medication or appointment changes or is removed.

    Only untouched future occurrences are replaced; acknowledged, snoozed and missed history is kept.
    """
    now = now or timezone.now()
    with transaction.atomic():
        Reminder.objects.filter(source_id=source_id, status=ReminderStatus.PENDING, scheduled_at__gt=now).delete()
        materialize_for_patient(patient, now=now)


def mark_missed(*, now: datetime | None = None) -> int:
    now = now or timezone.now()
    cutoff = now - timedelta(minutes=settings.REMINDER_MISSED_GRACE_MINUTES)
    candidates = list(
        Reminder.objects.filter(status=ReminderStatus.PENDING, scheduled_at__lt=cutoff).select_related("patient")
    ) + list(Reminder.objects.filter(status=ReminderStatus.SNOOZED, snoozed_until__lt=cutoff).select_related("patient"))
    missed = 0
    for reminder in candidates:
        # Conditional update so a concurrent acknowledgement wins and nothing is alerted twice.
        changed = Reminder.objects.filter(pk=reminder.pk, status=reminder.status).update(status=ReminderStatus.MISSED)
        if not changed:
            continue
        missed += 1
        log_event(
            "reminder.missed",
            patient=reminder.patient,
            reminder_type=reminder.type,
            scheduled_at=reminder.scheduled_at.isoformat(),
        )
        if reminder.type in ALERT_ON_MISSED:
            local = reminder.scheduled_at.astimezone(ZoneInfo(reminder.patient.timezone))
            create_alert(
                reminder.patient,
                AlertType.MEDICATION,
                Severity.WARNING,
                f"Reminder not acknowledged: {reminder.message} (due {local:%H:%M}).",
                data={"reminder_id": str(reminder.id)},
            )
    return missed


def _ensure_actionable(reminder: Reminder, now: datetime) -> None:
    if reminder.due_at > now + ACTION_WINDOW:
        raise ValidationError({"reminder": "This reminder is not due yet."})


def acknowledge(reminder: Reminder, user: User, *, now: datetime | None = None) -> Reminder:
    now = now or timezone.now()
    if reminder.status == ReminderStatus.ACKNOWLEDGED:
        return reminder
    _ensure_actionable(reminder, now)
    reminder.acknowledged_late = reminder.status == ReminderStatus.MISSED
    reminder.status = ReminderStatus.ACKNOWLEDGED
    reminder.acknowledged_at = now
    reminder.acknowledged_by = user
    reminder.save(update_fields=["status", "acknowledged_at", "acknowledged_by", "acknowledged_late"])
    log_event(
        "reminder.acknowledged",
        actor=user,
        patient=reminder.patient,
        reminder_type=reminder.type,
        late=reminder.acknowledged_late,
    )
    return reminder


def snooze(reminder: Reminder, user: User, minutes: int, *, now: datetime | None = None) -> Reminder:
    now = now or timezone.now()
    low, high = SNOOZE_MINUTES_RANGE
    if not low <= minutes <= high:
        raise ValidationError({"minutes": f"Snooze must be between {low} and {high} minutes."})
    if reminder.status not in (ReminderStatus.PENDING, ReminderStatus.SNOOZED):
        raise ValidationError({"reminder": "Only upcoming reminders can be snoozed."})
    _ensure_actionable(reminder, now)
    reminder.status = ReminderStatus.SNOOZED
    reminder.snoozed_until = now + timedelta(minutes=minutes)
    reminder.save(update_fields=["status", "snoozed_until"])
    log_event("reminder.snoozed", actor=user, patient=reminder.patient, reminder_type=reminder.type, minutes=minutes)
    return reminder
