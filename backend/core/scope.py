"""Patient-scope authorization: the single place that decides who may touch which patient's data.

API spec section 17: "Do not trust patient_id supplied by the client without authorization checks."
Every patient-specific view resolves its patient through these helpers.

- Patients can only ever reach their own profile.
- Caregivers reach a patient only through an active CaregiverPatient link with a sufficient permission level.
- A patient the caller cannot see raises 404 (API spec: "not found or not visible to caller"), so the API
  never confirms that another patient exists. Seeing a patient but lacking edit rights raises 403.
"""

from uuid import UUID

from django.db.models import QuerySet
from rest_framework.exceptions import NotFound, PermissionDenied

from accounts.models import Role, User
from care.models import PERMISSION_RANK, CaregiverPatient, Patient, PermissionLevel


def accessible_patients(user: User) -> QuerySet[Patient]:
    if user.role == Role.PATIENT:
        return Patient.objects.filter(user=user)
    if user.role == Role.CAREGIVER:
        return Patient.objects.filter(caregiver_links__caregiver__user=user, caregiver_links__is_active=True).distinct()
    return Patient.objects.none()


def caregiver_level(user: User, patient: Patient) -> str | None:
    link = (
        CaregiverPatient.objects.filter(caregiver__user=user, patient=patient, is_active=True)
        .only("permission_level")
        .first()
    )
    return link.permission_level if link else None


def resolve_patient(
    user: User, patient_id: UUID | str, *, write: bool = False, min_level: str | None = None
) -> Patient:
    """Return the patient if `user` may access it.

    `write=True` means a caregiver needs at least EDITOR (patients never get caregiver-style write access;
    endpoints that let patients write, such as acknowledging a reminder, do not pass `write`).
    `min_level` overrides the required caregiver level (for example PRIMARY to manage caregivers).
    """
    try:
        patient = Patient.objects.get(pk=patient_id)
    except (Patient.DoesNotExist, ValueError, TypeError) as exc:
        raise NotFound() from exc

    if user.role == Role.PATIENT:
        if patient.user_id != user.pk:
            raise NotFound()
        if write or min_level:
            raise PermissionDenied("Only caregivers can change this.")
        return patient

    if user.role == Role.CAREGIVER:
        level = caregiver_level(user, patient)
        if level is None:
            raise NotFound()
        required = min_level or (PermissionLevel.EDITOR if write else PermissionLevel.VIEWER)
        if PERMISSION_RANK[PermissionLevel(level)] < PERMISSION_RANK[PermissionLevel(required)]:
            raise PermissionDenied("Your access to this patient does not allow this change.")
        return patient

    raise NotFound()


def own_patient(user: User) -> Patient:
    """The patient profile of a signed-in patient user."""
    patient = Patient.objects.filter(user=user).first()
    if patient is None:
        raise NotFound("No patient profile is linked to this account.")
    return patient


def resolve_owned(user: User, obj_patient_id: UUID, *, write: bool = False) -> Patient:
    """Authorize access to an object that belongs to a patient (via its `patient_id`)."""
    return resolve_patient(user, obj_patient_id, write=write)
