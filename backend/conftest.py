"""Shared pytest fixtures: users, linked patients and authenticated API clients."""

from collections.abc import Callable
from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, User
from care.models import Caregiver, CaregiverPatient, Patient, PermissionLevel

PASSWORD = "Str0ng-Passphrase!"


@pytest.fixture(autouse=True)
def _clear_throttle_cache() -> None:
    cache.clear()


@pytest.fixture
def api() -> APIClient:
    return APIClient()


def client_for(user: User) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


@pytest.fixture
def make_caregiver(db: Any) -> Callable[..., User]:
    def _make(username: str = "carol", name: str = "Carol Caregiver") -> User:
        user = User.objects.create_user(username=username, password=PASSWORD, name=name, role=Role.CAREGIVER)
        Caregiver.objects.create(user=user)
        return user

    return _make


@pytest.fixture
def make_patient(db: Any) -> Callable[..., Patient]:
    def _make(
        caregiver: User | None = None,
        username: str | None = "pat",
        level: str = PermissionLevel.PRIMARY,
        name: str = "Pat Patient",
    ) -> Patient:
        user = None
        if username:
            user = User.objects.create_user(username=username, password=PASSWORD, name=name, role=Role.PATIENT)
        patient = Patient.objects.create(user=user, display_name=name, timezone="Asia/Kolkata")
        if caregiver is not None:
            CaregiverPatient.objects.create(
                caregiver=caregiver.caregiver_profile, patient=patient, permission_level=level
            )
        return patient

    return _make


@pytest.fixture
def world(make_caregiver: Callable[..., User], make_patient: Callable[..., Patient]) -> dict[str, Any]:
    """Two caregivers, each with one patient, plus clients for everyone. Used by IDOR tests."""
    carol = make_caregiver("carol")
    dave = make_caregiver("dave", name="Dave Other")
    pat = make_patient(carol, username="pat")
    other = make_patient(dave, username="otto", name="Otto Other")
    return {
        "carol": carol,
        "dave": dave,
        "pat": pat,
        "other": other,
        "carol_client": client_for(carol),
        "dave_client": client_for(dave),
        "pat_client": client_for(pat.user),  # type: ignore[arg-type]
        "other_client": client_for(other.user),  # type: ignore[arg-type]
    }
