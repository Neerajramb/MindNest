from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from audit.models import ActivityLog
from care.models import LinkCode
from care.services import create_patient_for_caregiver
from conftest import PASSWORD, client_for

pytestmark = pytest.mark.django_db


def _register_caregiver(api: APIClient, **overrides: str):
    payload = {"username": "newcarer", "password": PASSWORD, "name": "New Carer", **overrides}
    return api.post("/api/v1/auth/register/caregiver", payload)


def test_caregiver_registration_returns_tokens_and_role(api: APIClient) -> None:
    response = _register_caregiver(api)
    assert response.status_code == 201
    body = response.json()["data"]
    assert body["access"] and body["refresh"]
    assert body["user"]["role"] == Role.CAREGIVER
    assert body["user"]["caregiver_id"]


def test_registration_rejects_weak_password_and_duplicate_username(api: APIClient) -> None:
    weak = _register_caregiver(api, password="12345678")
    assert weak.status_code == 400
    assert weak.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _register_caregiver(api).status_code == 201
    duplicate = _register_caregiver(api, username="NEWCARER")
    assert duplicate.status_code == 400


def test_tc001_login_with_valid_credentials(api: APIClient, make_caregiver) -> None:
    make_caregiver("carol")
    response = api.post("/api/v1/auth/login", {"username": "carol", "password": PASSWORD})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["user"]["role"] == Role.CAREGIVER
    assert ActivityLog.objects.filter(event_type="auth.login").exists()


def test_tc002_login_with_invalid_credentials_creates_no_session(api: APIClient, make_caregiver) -> None:
    make_caregiver("carol")
    response = api.post("/api/v1/auth/login", {"username": "carol", "password": "wrong-password"})
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert "access" not in str(body)


def test_inactive_account_cannot_log_in(api: APIClient, make_caregiver) -> None:
    user = make_caregiver("carol")
    user.is_active = False
    user.save()
    assert api.post("/api/v1/auth/login", {"username": "carol", "password": PASSWORD}).status_code == 401


def test_refresh_rotates_and_old_refresh_token_is_rejected(api: APIClient, make_caregiver) -> None:
    make_caregiver("carol")
    tokens = api.post("/api/v1/auth/login", {"username": "carol", "password": PASSWORD}).json()["data"]
    first = api.post("/api/v1/auth/refresh", {"refresh": tokens["refresh"]})
    assert first.status_code == 200
    assert first.json()["data"]["refresh"] != tokens["refresh"]
    assert api.post("/api/v1/auth/refresh", {"refresh": tokens["refresh"]}).status_code == 401


def test_logout_blacklists_refresh_token(api: APIClient, make_caregiver) -> None:
    make_caregiver("carol")
    tokens = api.post("/api/v1/auth/login", {"username": "carol", "password": PASSWORD}).json()["data"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert api.post("/api/v1/auth/logout", {"refresh": tokens["refresh"]}).status_code == 204
    api.credentials()
    assert api.post("/api/v1/auth/refresh", {"refresh": tokens["refresh"]}).status_code == 401


def test_protected_endpoint_requires_authentication(api: APIClient) -> None:
    response = api.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_me_returns_current_user(make_caregiver) -> None:
    user = make_caregiver("carol")
    data = client_for(user).get("/api/v1/auth/me").json()["data"]
    assert data["username"] == "carol"
    assert data["role"] == Role.CAREGIVER


def _new_patient_code(make_caregiver) -> LinkCode:
    carer = make_caregiver("carol")
    _, code = create_patient_for_caregiver(carer, display_name="Thomas", timezone="Asia/Kolkata")
    return code


def test_patient_registers_with_link_code(api: APIClient, make_caregiver) -> None:
    code = _new_patient_code(make_caregiver)
    response = api.post(
        "/api/v1/auth/register/patient",
        {"link_code": code.code.lower(), "username": "thomas", "password": PASSWORD},
    )
    assert response.status_code == 201
    user = response.json()["data"]["user"]
    assert user["role"] == Role.PATIENT
    assert user["patient_id"] == str(code.patient_id)
    code.refresh_from_db()
    assert code.used_at is not None


def test_link_code_cannot_be_reused(api: APIClient, make_caregiver) -> None:
    code = _new_patient_code(make_caregiver)
    payload = {"link_code": code.code, "username": "thomas", "password": PASSWORD}
    assert api.post("/api/v1/auth/register/patient", payload).status_code == 201
    payload["username"] = "intruder"
    assert api.post("/api/v1/auth/register/patient", payload).status_code == 400
    assert not User.objects.filter(username="intruder").exists()


def test_expired_link_code_is_rejected(api: APIClient, make_caregiver) -> None:
    code = _new_patient_code(make_caregiver)
    code.expires_at = timezone.now() - timedelta(minutes=1)
    code.save()
    response = api.post(
        "/api/v1/auth/register/patient", {"link_code": code.code, "username": "thomas", "password": PASSWORD}
    )
    assert response.status_code == 400


def test_password_change_requires_current_password(make_caregiver) -> None:
    user = make_caregiver("carol")
    client = client_for(user)
    bad = client.post(
        "/api/v1/auth/password/change", {"current_password": "nope", "new_password": "An0ther-Passphrase!"}
    )
    assert bad.status_code == 400
    ok = client.post(
        "/api/v1/auth/password/change", {"current_password": PASSWORD, "new_password": "An0ther-Passphrase!"}
    )
    assert ok.status_code == 204
    user.refresh_from_db()
    assert user.check_password("An0ther-Passphrase!")


def test_login_is_rate_limited(api: APIClient, make_caregiver) -> None:
    make_caregiver("carol")
    statuses = [
        api.post("/api/v1/auth/login", {"username": "carol", "password": "wrong"}).status_code for _ in range(12)
    ]
    assert statuses[-1] == 429
