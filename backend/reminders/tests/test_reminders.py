"""TC-005 (reminder at configured time), AC-03, missed-reminder alerting, acknowledge/snooze rules."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import pytest
from django.utils import timezone

from notifications.models import Alert, AlertType, Notification
from reminders.models import Reminder, ReminderStatus, ReminderType
from reminders.service import mark_missed, materialize_for_patient
from scheduling.models import Medication, MedicationSchedule, Routine

pytestmark = pytest.mark.django_db

# 07:00 IST on 10 Oct 2026; a 08:00 IST dose is due at 02:30 UTC.
NOW = datetime(2026, 10, 10, 1, 30, tzinfo=UTC)
DOSE_AT = datetime(2026, 10, 10, 2, 30, tzinfo=UTC)


def _medication(patient: Any) -> MedicationSchedule:
    med = Medication.objects.create(patient=patient, name="Metformin", dosage_text="500mg")
    return MedicationSchedule.objects.create(medication=med, time_of_day=time(8, 0), start_date=date(2026, 10, 1))


def test_tc005_medication_reminder_generated_for_configured_time(world: dict[str, Any]) -> None:
    schedule = _medication(world["pat"])
    materialize_for_patient(world["pat"], now=NOW)
    reminder = Reminder.objects.get(source_id=schedule.id, scheduled_at=DOSE_AT)
    assert reminder.type == ReminderType.MEDICATION
    assert reminder.status == ReminderStatus.PENDING
    assert reminder.message == "Take Metformin"
    assert reminder.detail == "500mg"


def test_materialization_is_idempotent_and_bounded_by_horizon(world: dict[str, Any]) -> None:
    _medication(world["pat"])
    first = materialize_for_patient(world["pat"], now=NOW, horizon_hours=48)
    second = materialize_for_patient(world["pat"], now=NOW, horizon_hours=48)
    assert first == 2  # 10 Oct and 11 Oct 08:00 IST
    assert second == 0


def test_missed_medication_creates_caregiver_alert_and_notification(world: dict[str, Any]) -> None:
    _medication(world["pat"])
    materialize_for_patient(world["pat"], now=NOW)
    assert mark_missed(now=DOSE_AT + timedelta(minutes=29)) == 0
    assert mark_missed(now=DOSE_AT + timedelta(minutes=31)) == 1
    alert = Alert.objects.get()
    assert alert.type == AlertType.MEDICATION
    assert "08:00" in alert.message
    assert Notification.objects.filter(alert=alert, recipient=world["carol"]).exists()
    assert not Notification.objects.filter(recipient=world["dave"]).exists()


def test_missed_routine_is_recorded_without_alert(world: dict[str, Any]) -> None:
    Routine.objects.create(patient=world["pat"], title="Walk", scheduled_time=time(8, 0), start_date=date(2026, 10, 1))
    materialize_for_patient(world["pat"], now=NOW)
    assert mark_missed(now=DOSE_AT + timedelta(minutes=31)) == 1
    assert not Alert.objects.exists()


def _due_reminder(world: dict[str, Any], minutes_from_now: int = 0) -> Reminder:
    return Reminder.objects.create(
        patient=world["pat"],
        type=ReminderType.MEDICATION,
        source_id=world["pat"].id,
        scheduled_at=timezone.now() + timedelta(minutes=minutes_from_now),
        message="Take Metformin",
    )


def test_patient_acknowledges_due_reminder(world: dict[str, Any]) -> None:
    reminder = _due_reminder(world)
    response = world["pat_client"].post(f"/api/v1/reminders/{reminder.id}/acknowledge")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == ReminderStatus.ACKNOWLEDGED
    again = world["pat_client"].post(f"/api/v1/reminders/{reminder.id}/acknowledge")
    assert again.status_code == 200


def test_cannot_acknowledge_far_future_reminder(world: dict[str, Any]) -> None:
    reminder = _due_reminder(world, minutes_from_now=600)
    assert world["pat_client"].post(f"/api/v1/reminders/{reminder.id}/acknowledge").status_code == 400


def test_acknowledging_a_missed_reminder_is_marked_late(world: dict[str, Any]) -> None:
    reminder = _due_reminder(world, minutes_from_now=-120)
    mark_missed()
    data = world["pat_client"].post(f"/api/v1/reminders/{reminder.id}/acknowledge").json()["data"]
    assert data["status"] == ReminderStatus.ACKNOWLEDGED
    assert data["acknowledged_late"] is True


def test_only_the_patient_can_acknowledge_their_reminder(world: dict[str, Any]) -> None:
    reminder = _due_reminder(world)
    assert world["other_client"].post(f"/api/v1/reminders/{reminder.id}/acknowledge").status_code == 404
    assert world["carol_client"].post(f"/api/v1/reminders/{reminder.id}/acknowledge").status_code == 403


def test_snooze_then_missed_after_snooze_expires(world: dict[str, Any]) -> None:
    reminder = _due_reminder(world)
    assert world["pat_client"].post(f"/api/v1/reminders/{reminder.id}/snooze", {"minutes": 200}).status_code == 400
    response = world["pat_client"].post(f"/api/v1/reminders/{reminder.id}/snooze", {"minutes": 10})
    assert response.json()["data"]["status"] == ReminderStatus.SNOOZED
    assert mark_missed(now=timezone.now() + timedelta(minutes=30)) == 0
    assert mark_missed(now=timezone.now() + timedelta(minutes=45)) == 1


def test_reminder_list_for_patient_and_caregiver(world: dict[str, Any]) -> None:
    _due_reminder(world, minutes_from_now=30)
    pid = world["pat"].id
    for client in (world["pat_client"], world["carol_client"]):
        data = client.get(f"/api/v1/patients/{pid}/reminders").json()["data"]
        assert [r["message"] for r in data] == ["Take Metformin"]
    assert world["dave_client"].get(f"/api/v1/patients/{pid}/reminders").status_code == 404
    assert world["pat_client"].get(f"/api/v1/patients/{pid}/reminders?status=BOGUS").status_code == 400
