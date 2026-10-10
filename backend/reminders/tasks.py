from huey import crontab
from huey.contrib.djhuey import db_periodic_task

from care.models import Patient
from reminders.service import mark_missed, materialize_for_patient


@db_periodic_task(crontab(minute="*/15"))
def materialize_reminders_task() -> int:
    return sum(materialize_for_patient(patient) for patient in Patient.objects.all())


@db_periodic_task(crontab(minute="*"))
def mark_missed_reminders_task() -> int:
    return mark_missed()
