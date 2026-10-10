"""Day agenda: routines, medication doses and appointments for one local day (P-02 Home, P-06, C-03).

This is the deterministic source the assistant also uses for "What do I have today?" (BR-05).
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from care.models import Patient
from reminders.models import Reminder, ReminderType
from scheduling.models import Appointment, MedicationSchedule, Routine
from scheduling.recurrence import occurrences_between


@dataclass
class AgendaItem:
    kind: str
    source_id: UUID
    title: str
    detail: str
    at: datetime
    end_at: datetime | None = None
    location: str = ""
    reminder: Reminder | None = None

    def as_dict(self, tz: ZoneInfo) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "source_id": str(self.source_id),
            "title": self.title,
            "detail": self.detail,
            "at": self.at.astimezone(tz).isoformat(),
            "end_at": self.end_at.astimezone(tz).isoformat() if self.end_at else None,
            "location": self.location,
            "reminder": (
                {
                    "id": str(self.reminder.id),
                    "status": self.reminder.status,
                    "acknowledged_late": self.reminder.acknowledged_late,
                }
                if self.reminder
                else None
            ),
        }


def day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start, start + timedelta(days=1) - timedelta(microseconds=1)


def build_agenda(patient: Patient, day: date) -> list[AgendaItem]:
    tz = ZoneInfo(patient.timezone)
    start, end = day_bounds(day, tz)
    items: list[AgendaItem] = []

    for routine in Routine.objects.filter(patient=patient, is_active=True):
        for at in occurrences_between(
            routine.recurrence_rule,
            start_date=routine.start_date,
            end_date=routine.end_date,
            time_of_day=routine.scheduled_time,
            tz=tz,
            window_start=start,
            window_end=end,
        ):
            items.append(AgendaItem(ReminderType.ROUTINE, routine.id, routine.title, routine.notes, at))

    schedules = MedicationSchedule.objects.filter(
        medication__patient=patient, medication__is_active=True, is_active=True
    ).select_related("medication")
    for schedule in schedules:
        med = schedule.medication
        detail = " · ".join(p for p in (med.dosage_text, med.instructions) if p)
        for at in occurrences_between(
            schedule.recurrence_rule,
            start_date=schedule.start_date,
            end_date=schedule.end_date,
            time_of_day=schedule.time_of_day,
            tz=tz,
            window_start=start,
            window_end=end,
        ):
            items.append(AgendaItem(ReminderType.MEDICATION, schedule.id, med.name, detail, at))

    for appt in Appointment.objects.filter(patient=patient, start_at__gte=start, start_at__lte=end):
        items.append(
            AgendaItem(
                ReminderType.APPOINTMENT,
                appt.id,
                appt.title,
                appt.notes,
                appt.start_at,
                end_at=appt.end_at,
                location=appt.location,
            )
        )

    # Attach reminder status. Appointment reminders fire before the start time, so match them by source only.
    reminders = Reminder.objects.filter(patient=patient, source_id__in=[i.source_id for i in items])
    by_key = {(r.source_id, r.scheduled_at): r for r in reminders}
    by_source = {r.source_id: r for r in reminders if r.type == ReminderType.APPOINTMENT}
    for item in items:
        if item.kind == ReminderType.APPOINTMENT:
            item.reminder = by_source.get(item.source_id)
        else:
            item.reminder = by_key.get((item.source_id, item.at))

    return sorted(items, key=lambda i: i.at)
