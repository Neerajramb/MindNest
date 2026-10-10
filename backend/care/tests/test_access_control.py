"""RBAC and IDOR matrix: TC-003, TC-016, AC-10 (no cross-patient access)."""

from typing import Any

import pytest

from care.models import CaregiverPatient, EmergencyContact, PermissionLevel
from conftest import client_for

pytestmark = pytest.mark.django_db


def test_caregiver_creates_patient_and_becomes_primary(world: dict[str, Any]) -> None:
    response = world["carol_client"].post("/api/v1/patients", {"display_name": "Mrs. Iyer", "timezone": "Asia/Kolkata"})
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["my_permission_level"] == PermissionLevel.PRIMARY
    assert data["has_account"] is False
    assert len(data["link_code"]["code"]) == 8


def test_invalid_timezone_rejected(world: dict[str, Any]) -> None:
    response = world["carol_client"].post("/api/v1/patients", {"display_name": "X", "timezone": "Mars/Base"})
    assert response.status_code == 400


def test_tc003_patient_cannot_use_caregiver_routes(world: dict[str, Any]) -> None:
    client = world["pat_client"]
    assert client.get("/api/v1/patients").status_code == 403
    assert client.post("/api/v1/patients", {"display_name": "X"}).status_code == 403
    assert client.get(f"/api/v1/patients/{world['pat'].id}/audit").status_code == 403
    assert client.patch(f"/api/v1/patients/{world['pat'].id}", {"notes": "x"}).status_code == 403


def test_caregiver_list_only_shows_linked_patients(world: dict[str, Any]) -> None:
    ids = {p["id"] for p in world["carol_client"].get("/api/v1/patients").json()["data"]}
    assert ids == {str(world["pat"].id)}


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/patients/{id}"),
        ("patch", "/api/v1/patients/{id}"),
        ("get", "/api/v1/patients/{id}/caregivers"),
        ("post", "/api/v1/patients/{id}/caregivers"),
        ("post", "/api/v1/patients/{id}/link-codes"),
        ("get", "/api/v1/patients/{id}/emergency-contacts"),
        ("post", "/api/v1/patients/{id}/emergency-contacts"),
        ("get", "/api/v1/patients/{id}/activity"),
        ("get", "/api/v1/patients/{id}/audit"),
    ],
)
def test_tc016_unlinked_caregiver_gets_404(world: dict[str, Any], method: str, path: str) -> None:
    response = getattr(world["dave_client"], method)(path.format(id=world["pat"].id), {})
    assert response.status_code == 404


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/patients/{id}",
        "/api/v1/patients/{id}/caregivers",
        "/api/v1/patients/{id}/emergency-contacts",
        "/api/v1/patients/{id}/activity",
    ],
)
def test_patient_cannot_read_another_patient(world: dict[str, Any], path: str) -> None:
    assert world["other_client"].get(path.format(id=world["pat"].id)).status_code == 404


def test_patient_reads_own_profile(world: dict[str, Any]) -> None:
    client = world["pat_client"]
    assert client.get("/api/v1/patients/me").json()["data"]["id"] == str(world["pat"].id)
    assert client.get(f"/api/v1/patients/{world['pat'].id}").status_code == 200


def test_viewer_can_read_but_not_write(world: dict[str, Any], make_caregiver) -> None:
    viewer = make_caregiver("vera")
    CaregiverPatient.objects.create(
        caregiver=viewer.caregiver_profile, patient=world["pat"], permission_level=PermissionLevel.VIEWER
    )
    client = client_for(viewer)
    assert client.get(f"/api/v1/patients/{world['pat'].id}").status_code == 200
    assert client.patch(f"/api/v1/patients/{world['pat'].id}", {"notes": "x"}).status_code == 403
    contact = {"name": "Sarah", "phone": "+919876543210"}
    assert client.post(f"/api/v1/patients/{world['pat'].id}/emergency-contacts", contact).status_code == 403


def test_primary_authorizes_and_revokes_caregiver(world: dict[str, Any]) -> None:
    patient_id = world["pat"].id
    add = world["carol_client"].post(
        f"/api/v1/patients/{patient_id}/caregivers", {"username": "dave", "permission_level": "EDITOR"}
    )
    assert add.status_code == 201
    assert world["dave_client"].get(f"/api/v1/patients/{patient_id}").status_code == 200

    caregiver_id = add.json()["data"]["caregiver_id"]
    revoke = world["carol_client"].delete(f"/api/v1/patients/{patient_id}/caregivers/{caregiver_id}")
    assert revoke.status_code == 204
    assert world["dave_client"].get(f"/api/v1/patients/{patient_id}").status_code == 404


def test_editor_cannot_manage_caregivers_and_primary_cannot_be_removed(world: dict[str, Any]) -> None:
    patient_id = world["pat"].id
    world["carol_client"].post(
        f"/api/v1/patients/{patient_id}/caregivers", {"username": "dave", "permission_level": "EDITOR"}
    )
    attempt = world["dave_client"].post(
        f"/api/v1/patients/{patient_id}/caregivers", {"username": "dave", "permission_level": "EDITOR"}
    )
    assert attempt.status_code == 403
    carol_id = world["carol"].caregiver_profile.id
    assert world["carol_client"].delete(f"/api/v1/patients/{patient_id}/caregivers/{carol_id}").status_code == 400


def test_patient_updates_own_settings_within_limits(world: dict[str, Any]) -> None:
    client = world["pat_client"]
    ok = client.patch("/api/v1/patients/me/settings", {"text_scale": "1.5", "caregiver_memory_access": "NONE"})
    assert ok.status_code == 200
    assert ok.json()["data"]["caregiver_memory_access"] == "NONE"
    assert client.patch("/api/v1/patients/me/settings", {"text_scale": "5"}).status_code == 400


def test_emergency_contact_crud_by_editor(world: dict[str, Any]) -> None:
    patient_id = world["pat"].id
    created = world["carol_client"].post(
        f"/api/v1/patients/{patient_id}/emergency-contacts",
        {"name": "Sarah", "phone": "+91 98765 43210", "relationship": "Daughter"},
    )
    assert created.status_code == 201
    contact_id = created.json()["data"]["id"]
    assert created.json()["data"]["phone"] == "+919876543210"
    listed = world["pat_client"].get(f"/api/v1/patients/{patient_id}/emergency-contacts").json()["data"]
    assert [c["name"] for c in listed] == ["Sarah"]
    assert world["dave_client"].delete(f"/api/v1/emergency-contacts/{contact_id}").status_code == 404
    assert world["carol_client"].delete(f"/api/v1/emergency-contacts/{contact_id}").status_code == 204
    assert not EmergencyContact.objects.exists()


def test_link_code_reissue_requires_primary_and_no_account(world: dict[str, Any], make_patient) -> None:
    assert world["carol_client"].post(f"/api/v1/patients/{world['pat'].id}/link-codes").status_code == 400
    unregistered = make_patient(world["carol"], username=None, name="New Patient")
    response = world["carol_client"].post(f"/api/v1/patients/{unregistered.id}/link-codes")
    assert response.status_code == 201


def test_config_changes_are_audited(world: dict[str, Any]) -> None:
    world["carol_client"].patch(f"/api/v1/patients/{world['pat'].id}", {"notes": "Likes tea"})
    audit = world["carol_client"].get(f"/api/v1/patients/{world['pat'].id}/audit").json()
    assert audit["meta"]["total"] >= 1
    assert audit["data"][0]["event_type"] == "patient.updated"
