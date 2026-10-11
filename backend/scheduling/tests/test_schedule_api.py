"""AC-02 (caregiver schedules, patient sees), TC-004 (medication persists), access control on schedule APIs."""

from datetime import timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from care.models import CaregiverPatient, PermissionLevel
from conftest import client_for
from reminders.models import Reminder, ReminderStatus, ReminderType

pytestmark = pytest.mark.django_db
IST = ZoneInfo("Asia/Kolkata")


def _soon_local(minutes: int = 30) -> str:
    return (timezone.now() + timedelta(minutes=minutes)).astimezone(IST).strftime("%H:%M")


def test_ac02_caregiver_creates_routine_and_patient_sees_it(world: dict[str, Any]) -> None:
    pid = world["pat"].id
    created = world["carol_client"].post(
        f"/api/v1/patients/{pid}/schedule",
        {"title": "Morning walk", "scheduled_time": _soon_local(), "recurrence_rule": "freq=daily"},
    )
    assert created.status_code == 201
    assert created.json()["data"]["recurrence_rule"] == "FREQ=DAILY"

    routines = world["pat_client"].get(f"/api/v1/patients/{pid}/schedule").json()["data"]
    assert [r["title"] for r in routines] == ["Morning walk"]
    assert Reminder.objects.filter(patient=world["pat"], type=ReminderType.ROUTINE).exists()


def test_agenda_merges_routines_medications_and_appointments(world: dict[str, Any]) -> None:
    pid = world["pat"].id
    client = world["carol_client"]
    client.post(f"/api/v1/patients/{pid}/schedule", {"title": "Lunch", "scheduled_time": "13:00"})
    client.post(
        f"/api/v1/patients/{pid}/medications",
        {"name": "Metformin", "dosage_text": "500mg", "schedules": [{"time_of_day": "09:30"}]},
        format="json",
    )
    day = timezone.now().astimezone(IST).date() + timedelta(days=1)
    client.post(
        f"/api/v1/patients/{pid}/appointments",
        {"title": "Doctor visit", "start_at": f"{day}T15:00:00+05:30", "location": "Room 4"},
    )
    agenda = world["pat_client"].get(f"/api/v1/patients/{pid}/agenda?date={day}").json()["data"]
    assert [(i["kind"], i["title"]) for i in agenda["items"]] == [
        ("MEDICATION", "Metformin"),
        ("ROUTINE", "Lunch"),
        ("APPOINTMENT", "Doctor visit"),
    ]
    assert agenda["items"][0]["detail"] == "500mg"
    assert agenda["items"][2]["location"] == "Room 4"


def test_invalid_schedule_input_is_rejected(world: dict[str, Any]) -> None:
    pid = world["pat"].id
    client = world["carol_client"]
    bad_rule = client.post(
        f"/api/v1/patients/{pid}/schedule", {"title": "X", "scheduled_time": "08:00", "recurrence_rule": "FREQ=HOURLY"}
    )
    assert bad_rule.status_code == 400
    bad_range = client.post(
        f"/api/v1/patients/{pid}/appointments",
        {"title": "X", "start_at": "2026-10-20T10:00:00Z", "end_at": "2026-10-20T09:00:00Z"},
    )
    assert bad_range.status_code == 400
    assert client.post(f"/api/v1/patients/{pid}/medications", {"name": ""}, format="json").status_code == 400
    assert world["pat_client"].get(f"/api/v1/patients/{pid}/agenda?date=tomorrow").status_code == 400


def test_schedule_write_access_control(world: dict[str, Any], make_caregiver) -> None:
    pid = world["pat"].id
    payload = {"title": "Walk", "scheduled_time": "08:00"}
    # Patients may add their own reminders (covered below); medications stay caregiver-only.
    assert world["pat_client"].post(f"/api/v1/patients/{pid}/medications", {"name": "X"}).status_code == 403
    assert world["dave_client"].post(f"/api/v1/patients/{pid}/schedule", payload).status_code == 404
    assert world["dave_client"].get(f"/api/v1/patients/{pid}/medications").status_code == 404
    viewer = make_caregiver("vera")
    CaregiverPatient.objects.create(
        caregiver=viewer.caregiver_profile, patient=world["pat"], permission_level=PermissionLevel.VIEWER
    )
    assert client_for(viewer).post(f"/api/v1/patients/{pid}/schedule", payload).status_code == 403
    assert client_for(viewer).get(f"/api/v1/patients/{pid}/schedule").status_code == 200


def test_tc004_medication_with_schedules_persists_and_generates_reminders(world: dict[str, Any]) -> None:
    pid = world["pat"].id
    response = world["carol_client"].post(
        f"/api/v1/patients/{pid}/medications",
        {
            "name": "Metformin",
            "dosage_text": "500mg, 1 tablet",
            "instructions": "Take with breakfast",
            "schedules": [{"time_of_day": _soon_local(20)}, {"time_of_day": "21:00"}],
        },
        format="json",
    )
    assert response.status_code == 201
    medication = response.json()["data"]
    assert len(medication["schedules"]) == 2
    meds = world["pat_client"].get(f"/api/v1/patients/{pid}/medications").json()["data"]
    assert meds[0]["instructions"] == "Take with breakfast"
    reminders = Reminder.objects.filter(patient=world["pat"], type=ReminderType.MEDICATION)
    assert reminders.count() >= 2
    assert reminders.first().message == "Take Metformin"  # type: ignore[union-attr]


def test_deactivating_medication_removes_future_pending_reminders(world: dict[str, Any]) -> None:
    pid = world["pat"].id
    med = (
        world["carol_client"]
        .post(
            f"/api/v1/patients/{pid}/medications",
            {"name": "Aspirin", "schedules": [{"time_of_day": _soon_local(20)}]},
            format="json",
        )
        .json()["data"]
    )
    assert Reminder.objects.filter(type=ReminderType.MEDICATION).exists()
    assert world["carol_client"].delete(f"/api/v1/medications/{med['id']}").status_code == 204
    assert not Reminder.objects.filter(type=ReminderType.MEDICATION, status=ReminderStatus.PENDING).exists()
    assert world["pat_client"].get(f"/api/v1/patients/{pid}/medications").json()["data"] == []


def test_editing_schedule_time_replaces_pending_reminder(world: dict[str, Any]) -> None:
    pid = world["pat"].id
    routine = (
        world["carol_client"]
        .post(f"/api/v1/patients/{pid}/schedule", {"title": "Walk", "scheduled_time": _soon_local(30)})
        .json()["data"]
    )
    before = set(Reminder.objects.values_list("scheduled_at", flat=True))
    world["carol_client"].patch(f"/api/v1/schedule/{routine['id']}", {"scheduled_time": _soon_local(90)})
    after = set(Reminder.objects.values_list("scheduled_at", flat=True))
    assert before and after and before.isdisjoint(after)


def test_appointment_reminder_fires_before_start_and_is_removed_on_delete(world: dict[str, Any]) -> None:
    pid = world["pat"].id
    start = timezone.now() + timedelta(hours=5)
    appt = (
        world["carol_client"]
        .post(f"/api/v1/patients/{pid}/appointments", {"title": "Dentist", "start_at": start.isoformat()})
        .json()["data"]
    )
    reminder = Reminder.objects.get(type=ReminderType.APPOINTMENT)
    assert reminder.scheduled_at == start.replace(microsecond=reminder.scheduled_at.microsecond) - timedelta(hours=1)
    assert world["carol_client"].delete(f"/api/v1/appointments/{appt['id']}").status_code == 204
    assert not Reminder.objects.filter(type=ReminderType.APPOINTMENT).exists()


def test_patient_adds_own_one_off_reminder_and_caregivers_are_alerted(world: dict[str, Any]) -> None:
    from notifications.models import Alert, AlertType, Notification

    pid = world["pat"].id
    today = timezone.now().astimezone(IST).date()
    created = world["pat_client"].post(
        f"/api/v1/patients/{pid}/schedule",
        {"title": "Go to the park", "scheduled_time": _soon_local(), "start_date": today, "end_date": today},
    )
    assert created.status_code == 201
    assert Reminder.objects.filter(patient=world["pat"], message="Go to the park").count() == 1

    alert = Alert.objects.get(patient=world["pat"])
    assert alert.type == AlertType.PATIENT_REMINDER
    assert alert.message.startswith("Pat Patient added a reminder: Go to the park at ")
    assert alert.message.endswith(f"on {today:%a} {today.day} {today:%b}.")
    assert Notification.objects.filter(recipient=world["carol"], alert=alert).exists()

    # Patients can add, but changing or removing schedule items stays with caregivers.
    routine_id = created.json()["data"]["id"]
    assert world["pat_client"].patch(f"/api/v1/schedule/{routine_id}", {"title": "X"}).status_code == 403
    # And never for another patient.
    assert (
        world["other_client"]
        .post(f"/api/v1/patients/{pid}/schedule", {"title": "X", "scheduled_time": "10:00"})
        .status_code
        == 404
    )


def test_caregiver_routine_does_not_raise_an_alert(world: dict[str, Any]) -> None:
    from notifications.models import Alert

    world["carol_client"].post(
        f"/api/v1/patients/{world['pat'].id}/schedule", {"title": "Lunch", "scheduled_time": "13:00"}
    )
    assert not Alert.objects.exists()
