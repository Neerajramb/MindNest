"""Create synthetic demo accounts and data for the demonstration scenarios.

All data here is fictional. It is safe to send to the Gemini free tier (see docs/AI_USAGE.md).
Re-running is safe: existing demo records are reused, not duplicated.
"""

import os
from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from care.models import Caregiver, CaregiverPatient, EmergencyContact, Patient, PermissionLevel
from reminders.service import materialize_for_patient
from safety.models import Geofence
from scheduling.models import Appointment, Medication, MedicationSchedule, Routine

DEMO_PASSWORD_ENV = "MINDNEST_DEMO_PASSWORD"  # noqa: S105 - env var name, not a secret
# Fictional demo accounts only; the command refuses to run with DEBUG off unless forced.
DEFAULT_DEMO_PASSWORD = "MindNest-Demo-2026"  # noqa: S105


class Command(BaseCommand):
    help = "Create fictional demo caregiver and patient accounts (development only)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--force", action="store_true", help="Allow running when DJANGO_DEBUG is false.")

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG and not options["force"]:
            raise CommandError("Refusing to seed demo accounts with DEBUG off. Use --force if you really mean it.")
        password = os.environ.get(DEMO_PASSWORD_ENV, DEFAULT_DEMO_PASSWORD)

        caregiver_user = self._user("carol", "Carol Mathew", Role.CAREGIVER, password)
        caregiver, _ = Caregiver.objects.get_or_create(user=caregiver_user)
        patient_user = self._user("thomas", "Thomas Varghese", Role.PATIENT, password)
        patient, _ = Patient.objects.get_or_create(
            user=patient_user,
            defaults={"display_name": "Thomas Varghese", "preferred_name": "Thomas", "timezone": "Asia/Kolkata"},
        )
        CaregiverPatient.objects.get_or_create(
            caregiver=caregiver, patient=patient, defaults={"permission_level": PermissionLevel.PRIMARY}
        )
        EmergencyContact.objects.get_or_create(
            patient=patient,
            name="Carol Mathew",
            defaults={"phone": "+919800000001", "relationship": "Daughter", "priority": 1},
        )

        self._schedule(patient, caregiver_user)
        # Fictional home in Thiruvananthapuram; move it in the caregiver app to test with real GPS.
        Geofence.objects.get_or_create(
            patient=patient,
            name="Home",
            defaults={"latitude": 8.524100, "longitude": 76.936600, "radius_m": 300, "created_by": caregiver_user},
        )
        materialize_for_patient(patient)

        self.stdout.write(self.style.SUCCESS("Demo data ready (fictional):"))
        self.stdout.write(f"  caregiver: carol / {password}")
        self.stdout.write(f"  patient:   thomas / {password}")
        self.stdout.write(f"  patient id: {patient.id}")

    def _user(self, username: str, name: str, role: str, password: str) -> User:
        user, created = User.objects.get_or_create(username=username, defaults={"name": name, "role": role})
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
        elif user.role != role:
            raise CommandError(f"User {username!r} exists with a different role; not modifying it.")
        return user

    def _schedule(self, patient: Patient, author: User) -> None:
        """The routine shown in the wireframes: morning meds, a walk, lunch and a doctor visit."""
        for title, at in (("Morning walk", time(11, 0)), ("Lunch", time(13, 0)), ("Call Sarah", time(17, 0))):
            Routine.objects.get_or_create(
                patient=patient, title=title, defaults={"scheduled_time": at, "created_by": author}
            )
        med, _ = Medication.objects.get_or_create(
            patient=patient,
            name="Metformin",
            defaults={"dosage_text": "500mg, 1 tablet", "instructions": "Take with breakfast", "created_by": author},
        )
        for at in (time(9, 30), time(21, 0)):
            MedicationSchedule.objects.get_or_create(medication=med, time_of_day=at)
        tz = ZoneInfo(patient.timezone)
        today = timezone.now().astimezone(tz).date()
        start = datetime.combine(today, time(15, 0), tzinfo=tz)
        if start <= timezone.now():
            start += timedelta(days=1)
        Appointment.objects.get_or_create(
            patient=patient,
            title="Doctor visit",
            defaults={"start_at": start, "location": "Room 4, City Clinic", "created_by": author},
        )
