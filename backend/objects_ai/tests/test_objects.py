"""FR-009..011, OBJ-01..08, BR-03, AC-04, TC-006/TC-007 (with a controllable detector)."""

import io
from datetime import timedelta
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from ai.gemini import AIUnavailable
from ai.objects import Detection
from objects_ai.models import ObjectObservation, Place, TrackedObject
from objects_ai.service import find_object, last_seen_answer

pytestmark = pytest.mark.django_db


class FakeDetector:
    def __init__(self) -> None:
        self.detections: list[Detection] = []
        self.vocabulary: list[str] = []
        self.fail = False

    def detect(self, jpeg: bytes, vocabulary: list[str]) -> list[Detection]:
        if self.fail:
            raise AIUnavailable("down")
        self.vocabulary = vocabulary
        return self.detections


@pytest.fixture
def detector(monkeypatch: pytest.MonkeyPatch) -> FakeDetector:
    fake = FakeDetector()
    monkeypatch.setattr("objects_ai.views.get_object_detector", lambda: fake)
    return fake


@pytest.fixture
def home(world: dict[str, Any]) -> dict[str, Any]:
    patient = world["pat"]
    return {
        "kitchen": Place.objects.create(patient=patient, name="Kitchen"),
        "keys": TrackedObject.objects.create(patient=patient, name="keys", aliases="car keys"),
        "glasses": TrackedObject.objects.create(patient=patient, name="glasses", aliases="spectacles"),
        "phone": TrackedObject.objects.create(patient=patient, name="phone"),
    }


def _photo() -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 180, 160)).save(buffer, format="JPEG")
    return SimpleUploadedFile("scan.jpg", buffer.getvalue(), content_type="image/jpeg")


def _scan(world: dict[str, Any], **data: Any) -> Any:
    return world["pat_client"].post(
        f"/api/v1/patients/{world['pat'].id}/objects/scan", {"image": _photo(), **data}, format="multipart"
    )


def _ask(world: dict[str, Any], query: str) -> dict[str, Any]:
    response = world["pat_client"].post("/api/v1/objects/query", {"query": query}, format="json")
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def test_tc006_scan_stores_observations_for_confident_tracked_items(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector
) -> None:
    detector.detections = [Detection("keys", 0.92), Detection("glasses", 0.3)]
    response = _scan(world, place_id=str(home["kitchen"].id))
    assert response.status_code == 201
    assert response.json()["data"] == {
        "found": ["keys"],
        "message": "I saw your keys in the kitchen. I'll remember that.",
    }
    assert detector.vocabulary == ["glasses", "keys", "phone"]
    observation = ObjectObservation.objects.get()
    assert observation.confidence is not None
    assert (observation.tracked_object.name, observation.place, float(observation.confidence)) == (
        "keys",
        home["kitchen"],
        0.92,
    )


def test_tc007_ac04_query_returns_last_observation_with_time(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector
) -> None:
    detector.detections = [Detection("keys", 0.9)]
    _scan(world, place_id=str(home["kitchen"].id))
    data = _ask(world, "Where did I put my car keys?")
    assert data["status"] == "FOUND"
    assert data["answer"].startswith("Your keys were last seen in the kitchen today at ")
    assert data["last_seen"]["place"] == "Kitchen"
    assert data["stale"] is False


def test_singular_item_wording_and_old_observation_warning(world: dict[str, Any], home: dict[str, Any]) -> None:
    ObjectObservation.objects.create(
        tracked_object=home["phone"],
        patient=world["pat"],
        place=home["kitchen"],
        observed_at=timezone.now() - timedelta(days=3),
        confidence=0.8,
        source="VISION",
    )
    answer = last_seen_answer(world["pat"], home["phone"])
    assert answer.answer.startswith("Your phone was last seen in the kitchen on ")
    assert answer.stale is True
    assert "may have been moved" in answer.answer


def test_obj08_no_observation_and_unknown_item(world: dict[str, Any], home: dict[str, Any]) -> None:
    assert _ask(world, "where are my spectacles")["answer"] == "I don't have a recent location for your glasses."
    unknown = _ask(world, "where is my umbrella")
    assert unknown["status"] == "UNKNOWN_OBJECT"
    assert unknown["object"] is None


def test_object_matching_handles_plurals_and_longest_name(world: dict[str, Any], home: dict[str, Any]) -> None:
    patient = world["pat"]
    assert find_object(patient, "Where's my KEY?") == home["keys"]
    assert find_object(patient, "lost my glasses again") == home["glasses"]
    TrackedObject.objects.create(patient=patient, name="phone charger")
    assert find_object(patient, "where is the phone charger").name == "phone charger"  # type: ignore[union-attr]
    assert find_object(patient, "what is the weather") is None


def test_scan_failure_returns_503_and_stores_nothing(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector
) -> None:
    detector.fail = True
    response = _scan(world, place_id=str(home["kitchen"].id))
    assert response.status_code == 503
    assert not ObjectObservation.objects.exists()


def test_object_access_control(world: dict[str, Any], home: dict[str, Any], detector: FakeDetector) -> None:
    pid = world["pat"].id
    assert world["dave_client"].get(f"/api/v1/patients/{pid}/objects").status_code == 404
    other_place = Place.objects.create(patient=world["other"], name="Their kitchen")
    assert _scan(world, place_id=str(other_place.id)).status_code == 404
    assert world["carol_client"].post("/api/v1/objects/query", {"query": "keys"}, format="json").status_code == 403
    listed = world["carol_client"].get(f"/api/v1/patients/{pid}/objects").json()["data"]
    assert {o["name"] for o in listed} == {"keys", "glasses", "phone"}


def test_tracked_objects_are_unique_per_patient(world: dict[str, Any], home: dict[str, Any]) -> None:
    url = f"/api/v1/patients/{world['pat'].id}/objects"
    assert world["carol_client"].post(url, {"name": "Keys"}).status_code == 400
    assert world["pat_client"].post(url, {"name": "umbrella"}).status_code == 201
