from typing import Any

from rest_framework.exceptions import NotAuthenticated
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from accounts.models import Role, User


class IsPatient(BasePermission):
    message = "This is only available to patients."

    def has_permission(self, request: Request, view: Any) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.PATIENT)


class IsCaregiver(BasePermission):
    message = "This is only available to caregivers."

    def has_permission(self, request: Request, view: Any) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.CAREGIVER)


class IsPatientOrCaregiver(BasePermission):
    message = "This is only available to patients and caregivers."

    def has_permission(self, request: Request, view: Any) -> bool:
        return bool(
            request.user and request.user.is_authenticated and request.user.role in (Role.PATIENT, Role.CAREGIVER)
        )


def user_of(request: Request) -> User:
    """The authenticated user, typed as our User model (views behind IsAuthenticated)."""
    user = request.user
    if not isinstance(user, User):
        raise NotAuthenticated()
    return user
