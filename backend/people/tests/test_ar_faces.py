"""AR Vision: every familiar face in a frame, with its position, named only above the threshold (BR-04)."""

import io
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from audit.models import ActivityLog
from people.models import FaceEmbedding, Person

pytestmark = pytest.mark.django_db


def _unit(values: list[float]) -> np.ndarray:
    vector = np.zeros(128, dtype=np.float32)
    vector[: len(values)] = values
    return vector / np.linalg.norm(vector)


@dataclass
class Face:
    box: np.ndarray
    vector: np.ndarray
    good_quality: bool = True
    score: float = 0.95


@dataclass
class Engine:
    faces: list[Face] = field(default_factory=list)

    def detect(self, rgb: np.ndarray) -> list[Face]:
        return self.faces

    def embed(self, rgb: np.ndarray, face: Face) -> np.ndarray:
        return face.vector


@pytest.fixture
def engine(monkeypatch: pytest.MonkeyPatch) -> Engine:
    fake = Engine()
    monkeypatch.setattr("assistant.live.get_face_engine", lambda: fake)
    return fake


def _register(patient: Any, name: str, vector: np.ndarray) -> Person:
    person = Person.objects.create(patient=patient, name=name, relationship="Daughter", consent_confirmed=True)
    FaceEmbedding.objects.create(person=person, vector=vector.tobytes(), model_name="t", model_version="1")
    return person


def _frame(world: dict[str, Any], client: str = "pat_client") -> Any:
    buffer = io.BytesIO()
    Image.new("RGB", (400, 200), (90, 90, 90)).save(buffer, format="JPEG")
    image = SimpleUploadedFile("frame.jpg", buffer.getvalue(), content_type="image/jpeg")
    return world[client].post("/api/v1/live/faces", {"image": image}, format="multipart")


def test_names_each_face_with_its_position(world: dict[str, Any], engine: Engine) -> None:
    sarah = _register(world["pat"], "Sarah", _unit([1, 0]))
    engine.faces = [
        Face(np.array([100, 50, 80, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9]), _unit([1, 0.05])),
        Face(np.array([300, 20, 60, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9]), _unit([0, 1])),
        Face(np.array([0, 0, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3]), _unit([1, 0]), good_quality=False),
    ]
    response = _frame(world)
    assert response.status_code == 200
    faces = response.json()["data"]["faces"]
    assert [(f["status"], f["person"] and f["person"]["name"]) for f in faces] == [
        ("RECOGNIZED", "Sarah"),
        ("UNKNOWN", None),
    ]
    assert faces[0]["box"] == [0.25, 0.25, 0.2, 0.5]
    assert faces[0]["person"]["id"] == str(sarah.id)


def test_one_person_is_named_once_and_audited_sparingly(world: dict[str, Any], engine: Engine) -> None:
    _register(world["pat"], "Sarah", _unit([1, 0]))
    box = np.array([10, 10, 80, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9])
    engine.faces = [Face(box, _unit([1, 0.4])), Face(box, _unit([1, 0.1]))]
    for _ in range(3):
        faces = _frame(world).json()["data"]["faces"]
    assert [f["status"] for f in faces] == ["UNKNOWN", "RECOGNIZED"]
    assert ActivityLog.objects.filter(event_type="face.recognition").count() == 1


def test_never_matches_another_patients_people_and_is_patient_only(world: dict[str, Any], engine: Engine) -> None:
    _register(world["other"], "Stranger", _unit([1, 0]))
    engine.faces = [Face(np.array([10, 10, 80, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9]), _unit([1, 0]))]
    assert _frame(world).json()["data"]["faces"][0]["status"] == "UNKNOWN"
    assert _frame(world, "carol_client").status_code == 403
