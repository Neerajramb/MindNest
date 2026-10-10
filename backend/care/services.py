import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from care.models import Caregiver, CaregiverPatient, LinkCode, Patient, PermissionLevel

# No 0/O, 1/I/L: codes are read aloud and typed by people with memory difficulties.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


def _new_code() -> str:
    while True:
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
        if not LinkCode.objects.filter(code=code).exists():
            return code


def issue_link_code(patient: Patient, created_by: User) -> LinkCode:
    """Issue a fresh one-time code and invalidate older unused ones for the same patient."""
    now = timezone.now()
    LinkCode.objects.filter(patient=patient, used_at__isnull=True, expires_at__gt=now).update(expires_at=now)
    return LinkCode.objects.create(
        patient=patient,
        code=_new_code(),
        created_by=created_by,
        expires_at=now + timedelta(hours=settings.LINK_CODE_TTL_HOURS),
    )


@transaction.atomic
def create_patient_for_caregiver(caregiver_user: User, **profile: object) -> tuple[Patient, LinkCode]:
    caregiver = Caregiver.objects.get(user=caregiver_user)
    patient = Patient.objects.create(**profile)
    CaregiverPatient.objects.create(caregiver=caregiver, patient=patient, permission_level=PermissionLevel.PRIMARY)
    return patient, issue_link_code(patient, caregiver_user)
