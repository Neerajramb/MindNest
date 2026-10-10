"""TC-014, TC-015, AC-09 (geofence alert), SOS, stale-location and retention rules."""

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from care.models import CaregiverPatient, EmergencyContact, PermissionLevel
from conftest import client_for
from notifications.models import Alert, AlertType, Severity
from safety.models import Geofence, Location, SafetyState, ZoneStatus
from safety.service import check_stale_locations, haversine_m, purge_old_locations, record_location

pytestmark = pytest.mark.django_db

HOME = (8.524100, 76.936600)  # Thiruvananthapuram (fictional home)
NEAR = (8.524500, 76.936900)  # ~55 m away
FAR = (8.534100, 76.936600)  # ~1.11 km north


def _zone(world: dict[str, Any], radius: int = 200, name: str = "Home", center: tuple[float, float] = HOME) -> str:
    response = world["carol_client"].post(
        f"/api/v1/patients/{world['pat'].id}/geofences",
        {"name": name, "latitude": center[0], "longitude": center[1], "radius_m": radius},
    )
    assert response.status_code == 201, response.json()
    return str(response.json()["data"]["id"])


def _report(world: dict[str, Any], point: tuple[float, float], **extra: Any) -> Any:
    return world["pat_client"].post(
        f"/api/v1/patients/{world['pat'].id}/locations",
        {"latitude": point[0], "longitude": point[1], "accuracy_m": 10, **extra},
        format="json",
    )


def test_haversine_matches_known_distance() -> None:
    assert haversine_m(0, 0, 1, 0) == pytest.approx(111_195, rel=1e-3)
    assert haversine_m(*HOME, *FAR) == pytest.approx(1_112, rel=0.01)


def test_tc014_location_inside_radius_raises_no_alert(world: dict[str, Any]) -> None:
    _zone(world)
    response = _report(world, NEAR)
    assert response.status_code == 201
    assert response.json()["data"]["status"] == ZoneStatus.INSIDE
    assert response.json()["data"]["zone_name"] == "Home"
    assert not Alert.objects.exists()


def test_tc015_ac09_crossing_boundary_alerts_once_with_time_and_location(world: dict[str, Any]) -> None:
    _zone(world)
    _report(world, NEAR)
    outside = _report(world, FAR)
    assert outside.json()["data"]["status"] == ZoneStatus.OUTSIDE
    alert = Alert.objects.get()
    assert (alert.type, alert.severity) == (AlertType.GEOFENCE, Severity.HIGH)
    assert "Home" in alert.message
    assert alert.data["latitude"] == "8.534100"
    assert "recorded_at" in alert.data

    _report(world, FAR)  # still outside: no duplicate alert
    assert Alert.objects.count() == 1
    _report(world, NEAR)  # back inside
    _report(world, FAR)  # leaves again: new alert
    assert Alert.objects.count() == 2


def test_first_report_outside_alerts(world: dict[str, Any]) -> None:
    _zone(world)
    _report(world, FAR)
    assert Alert.objects.filter(type=AlertType.GEOFENCE).count() == 1


def test_inaccurate_fix_near_edge_is_not_treated_as_exit(world: dict[str, Any]) -> None:
    _zone(world, radius=1000)
    _report(world, NEAR)
    response = _report(world, FAR, accuracy_m=150)  # 1112 m - 150 m accuracy <= 1000 m radius
    assert response.json()["data"]["status"] == ZoneStatus.INSIDE
    assert not Alert.objects.exists()


def test_inside_any_of_several_zones_is_safe(world: dict[str, Any]) -> None:
    _zone(world, name="Home")
    _zone(world, name="Daughter's house", center=FAR)
    assert _report(world, FAR).json()["data"]["zone_name"] == "Daughter's house"
    assert not Alert.objects.exists()


def test_caregiver_can_simulate_test_locations_only(world: dict[str, Any], make_caregiver) -> None:
    _zone(world)
    url = f"/api/v1/patients/{world['pat'].id}/locations"
    payload = {"latitude": FAR[0], "longitude": FAR[1], "source": "TEST"}
    assert world["carol_client"].post(url, payload, format="json").status_code == 201
    assert Alert.objects.get().data["source"] == "TEST"
    assert world["carol_client"].post(url, {**payload, "source": "GPS"}, format="json").status_code == 403
    assert world["pat_client"].post(url, payload, format="json").status_code == 400
    assert world["dave_client"].post(url, payload, format="json").status_code == 404
    viewer = make_caregiver("vera")
    CaregiverPatient.objects.create(
        caregiver=viewer.caregiver_profile, patient=world["pat"], permission_level=PermissionLevel.VIEWER
    )
    assert client_for(viewer).post(url, payload, format="json").status_code == 403


def test_location_validation_and_sharing_switch(world: dict[str, Any]) -> None:
    url = f"/api/v1/patients/{world['pat'].id}/locations"
    assert world["pat_client"].post(url, {"latitude": 95, "longitude": 0}, format="json").status_code == 400
    future = (timezone.now() + timedelta(hours=1)).isoformat()
    assert (
        world["pat_client"].post(url, {"latitude": 1, "longitude": 1, "recorded_at": future}, format="json").status_code
        == 400
    )
    precise = world["pat_client"].post(url, {"latitude": 8.5241234567, "longitude": 76.9366}, format="json")
    assert precise.status_code == 201
    world["pat"].location_sharing_enabled = False
    world["pat"].save()
    assert _report(world, NEAR).status_code == 400


def test_geofence_validation_and_permissions(world: dict[str, Any]) -> None:
    url = f"/api/v1/patients/{world['pat'].id}/geofences"
    zone = {"name": "Home", "latitude": HOME[0], "longitude": HOME[1], "radius_m": 200}
    assert world["carol_client"].post(url, {**zone, "radius_m": 0}).status_code == 400
    assert world["carol_client"].post(url, {**zone, "latitude": 100}).status_code == 400
    assert world["pat_client"].post(url, zone).status_code == 403
    assert world["dave_client"].get(url).status_code == 404
    zone_id = _zone(world)
    assert world["carol_client"].patch(f"/api/v1/geofences/{zone_id}", {"radius_m": 500}).status_code == 200
    assert world["carol_client"].delete(f"/api/v1/geofences/{zone_id}").status_code == 204
    assert world["carol_client"].get(url).json()["data"] == []


def test_safety_status_never_reports_safe_without_fresh_location(world: dict[str, Any]) -> None:
    url = f"/api/v1/patients/{world['pat'].id}/safety"
    _zone(world)
    empty = world["pat_client"].get(url).json()["data"]
    assert empty["status"] == ZoneStatus.UNKNOWN
    assert empty["last_location"] is None
    _report(world, NEAR)
    Location.objects.update(recorded_at=timezone.now() - timedelta(hours=3))
    stale = world["carol_client"].get(f"/api/v1/patients/{world['pat'].id}/locations/latest").json()["data"]
    assert stale["status"] == ZoneStatus.UNKNOWN
    assert stale["location_stale"] is True
    assert stale["last_location"] is not None


def test_stale_location_alerts_once_per_episode(world: dict[str, Any]) -> None:
    Geofence.objects.create(patient=world["pat"], name="Home", latitude=HOME[0], longitude=HOME[1], radius_m=200)
    old = timezone.now() - timedelta(hours=2)
    record_location(world["pat"], latitude=HOME[0], longitude=HOME[1], recorded_at=old, source="GPS")
    assert check_stale_locations() == 1
    assert check_stale_locations() == 0
    assert Alert.objects.filter(type=AlertType.LOCATION_UNAVAILABLE).count() == 1
    record_location(world["pat"], latitude=HOME[0], longitude=HOME[1], recorded_at=timezone.now(), source="GPS")
    assert SafetyState.objects.get(patient=world["pat"]).stale_alerted_at is None


def test_old_locations_are_purged_but_latest_is_kept(world: dict[str, Any]) -> None:
    old = timezone.now() - timedelta(days=40)
    for minutes in (0, 5):
        record_location(
            world["pat"],
            latitude=HOME[0],
            longitude=HOME[1],
            recorded_at=old + timedelta(minutes=minutes),
            source="GPS",
        )
    assert purge_old_locations() == 1
    assert Location.objects.count() == 1


def test_sos_alerts_caregivers_and_returns_contacts(world: dict[str, Any]) -> None:
    EmergencyContact.objects.create(patient=world["pat"], name="Sarah", phone="+919800000001")
    response = world["pat_client"].post("/api/v1/sos")
    assert response.status_code == 201
    assert [c["name"] for c in response.json()["data"]["emergency_contacts"]] == ["Sarah"]
    alert = Alert.objects.get()
    assert (alert.type, alert.severity) == (AlertType.SOS, Severity.HIGH)
    assert world["carol_client"].post("/api/v1/sos").status_code == 403
