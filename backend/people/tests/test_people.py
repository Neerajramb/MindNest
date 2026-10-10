"""FR-012..014, FACE-01..05, PEO-01..04, AC-05 (rules), TC-008/TC-009 (with a controllable fake engine)."""

import io
from dataclasses import dataclass
from typing import Any

import numpy as np
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from ai.face import FaceModelsMissing
from people.models import FaceEmbedding, Person

pytestmark = pytest.mark.django_db


def _jpeg(color: tuple[int, int, int] = (120, 90, 60)) -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (200, 200), color).save(buffer, format="JPEG")
    return SimpleUploadedFile("face.jpg", buffer.getvalue(), content_type="image/jpeg")


@dataclass
class FakeFace:
    good_quality: bool = True
    score: float = 0.95


class FakeEngine:
    """Detects `faces` and returns `vector` as the embedding, so tests choose the similarity."""

    def __init__(self) -> None:
        self.faces: list[FakeFace] = [FakeFace()]
        self.vector = _unit([1.0, 0.0])

    def detect(self, rgb: np.ndarray) -> list[FakeFace]:
        return self.faces

    def embed(self, rgb: np.ndarray, face: FakeFace) -> np.ndarray:
        return self.vector


def _unit(values: list[float]) -> np.ndarray:
    vector = np.zeros(128, dtype=np.float32)
    vector[: len(values)] = values
    return vector / np.linalg.norm(vector)


@pytest.fixture
def engine(monkeypatch: pytest.MonkeyPatch) -> FakeEngine:
    fake = FakeEngine()
    monkeypatch.setattr("people.views.get_face_engine", lambda: fake)
    return fake


def _person(world: dict[str, Any], **extra: Any) -> str:
    response = world["carol_client"].post(
        f"/api/v1/patients/{world['pat'].id}/people",
        {"name": "Sarah", "relationship": "Daughter", "consent_confirmed": True, **extra},
    )
    assert response.status_code == 201, response.json()
    return str(response.json()["data"]["id"])


def _enrol(world: dict[str, Any], person_id: str) -> Any:
    return world["carol_client"].post(
        f"/api/v1/people/{person_id}/face-embeddings", {"image": _jpeg()}, format="multipart"
    )


def _recognize(world: dict[str, Any]) -> dict[str, Any]:
    response = world["pat_client"].post("/api/v1/face/recognize", {"image": _jpeg()}, format="multipart")
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def test_registration_requires_consent(world: dict[str, Any]) -> None:
    response = world["carol_client"].post(
        f"/api/v1/patients/{world['pat'].id}/people", {"name": "Sarah", "consent_confirmed": False}
    )
    assert response.status_code == 400
    assert "consent_confirmed" in response.json()["error"]["details"]


def test_tc008_registered_person_is_recognized(world: dict[str, Any], engine: FakeEngine) -> None:
    person_id = _person(world)
    assert _enrol(world, person_id).json()["data"]["face_count"] == 1
    result = _recognize(world)
    assert result["status"] == "RECOGNIZED"
    assert result["person"]["name"] == "Sarah"
    assert result["message"] == "This looks like Sarah, your daughter."
    assert result["confidence"] == "high"
    assert "similarity" not in result and "vector" not in str(result)


def test_tc009_unknown_face_is_not_mapped_to_anyone(world: dict[str, Any], engine: FakeEngine) -> None:
    _enrol(world, _person(world))
    engine.vector = _unit([0.2, 1.0])  # cosine ~0.2, below the 0.40 threshold
    result = _recognize(world)
    assert result["status"] == "UNKNOWN"
    assert result["person"] is None
    assert result["message"] == "I'm not sure who this is."


def test_borderline_match_is_reported_with_medium_confidence(world: dict[str, Any], engine: FakeEngine) -> None:
    _enrol(world, _person(world))
    engine.vector = _unit([0.5, 0.95])  # cosine ~0.47: above the 0.40 threshold, below the "high" band (0.55)
    assert _recognize(world)["confidence"] == "medium"


def test_no_face_and_unclear_face(world: dict[str, Any], engine: FakeEngine) -> None:
    _enrol(world, _person(world))
    engine.faces = []
    assert _recognize(world)["status"] == "NO_FACE"
    engine.faces = [FakeFace(good_quality=False)]
    assert _recognize(world)["status"] == "UNCLEAR"


def test_enrolment_needs_exactly_one_clear_face(world: dict[str, Any], engine: FakeEngine) -> None:
    person_id = _person(world)
    engine.faces = []
    assert _enrol(world, person_id).status_code == 400
    engine.faces = [FakeFace(), FakeFace()]
    assert "More than one face" in str(_enrol(world, person_id).json()["error"]["details"]["image"])
    engine.faces = [FakeFace(good_quality=False)]
    assert _enrol(world, person_id).status_code == 400
    assert not FaceEmbedding.objects.exists()


def test_recognition_only_uses_this_patients_people(world: dict[str, Any], engine: FakeEngine) -> None:
    other_person = world["dave_client"].post(
        f"/api/v1/patients/{world['other'].id}/people", {"name": "Stranger", "consent_confirmed": True}
    )
    world["dave_client"].post(
        f"/api/v1/people/{other_person.json()['data']['id']}/face-embeddings", {"image": _jpeg()}, format="multipart"
    )
    assert _recognize(world)["status"] == "UNKNOWN"


def test_revoking_a_person_deletes_face_data(world: dict[str, Any], engine: FakeEngine) -> None:
    person_id = _person(world)
    _enrol(world, person_id)
    assert world["carol_client"].delete(f"/api/v1/people/{person_id}").status_code == 204
    assert not FaceEmbedding.objects.exists()
    assert Person.objects.get(pk=person_id).is_active is False
    assert _recognize(world)["status"] == "UNKNOWN"


def test_people_access_control(world: dict[str, Any], engine: FakeEngine) -> None:
    person_id = _person(world)
    people_url = f"/api/v1/patients/{world['pat'].id}/people"
    assert world["pat_client"].get(people_url).status_code == 200
    assert world["pat_client"].post(people_url, {"name": "X", "consent_confirmed": True}).status_code == 403
    assert world["dave_client"].get(people_url).status_code == 404
    enrol_url = f"/api/v1/people/{person_id}/face-embeddings"
    assert world["dave_client"].post(enrol_url, {"image": _jpeg()}, format="multipart").status_code == 404
    assert (
        world["carol_client"].post("/api/v1/face/recognize", {"image": _jpeg()}, format="multipart").status_code == 403
    )


def test_upload_validation(world: dict[str, Any], engine: FakeEngine) -> None:
    url = "/api/v1/face/recognize"
    assert world["pat_client"].post(url, {}, format="multipart").status_code == 400
    fake = SimpleUploadedFile("x.jpg", b"not an image", content_type="image/jpeg")
    assert world["pat_client"].post(url, {"image": fake}, format="multipart").status_code == 400


def test_missing_models_degrade_gracefully(world: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    def missing() -> None:
        raise FaceModelsMissing("models")

    monkeypatch.setattr("people.views.get_face_engine", missing)
    response = world["pat_client"].post("/api/v1/face/recognize", {"image": _jpeg()}, format="multipart")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
