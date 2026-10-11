"""Live companion look: room, belongings and familiar faces from one frame (FR-009..014 combined)."""

import io
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from ai.gemini import AIUnavailable
from ai.objects import Detection, Scene
from objects_ai.models import ObjectObservation, Place, TrackedObject
from objects_ai.service import find_object, last_seen_answer
from people.models import Person
from people.service import Recognition

pytestmark = pytest.mark.django_db


class FakeDetector:
    def __init__(self) -> None:
        self.scene = Scene(None, "", [], [])
        self.calls: list[tuple[list[str], list[str]]] = []
        self.fail = False

    def detect(self, jpeg: bytes, vocabulary: list[str]) -> list[Detection]:
        raise AssertionError("live looks use describe()")

    def describe(self, jpeg: bytes, vocabulary: list[str], places: list[str], room_hint: str | None = None) -> Scene:
        if self.fail:
            raise AIUnavailable("down")
        self.calls.append((vocabulary, places))
        self.hint = room_hint
        return self.scene


@pytest.fixture
def detector(monkeypatch: pytest.MonkeyPatch) -> FakeDetector:
    fake = FakeDetector()
    monkeypatch.setattr("assistant.live.get_object_detector", lambda: fake)
    return fake


@pytest.fixture
def faces(monkeypatch: pytest.MonkeyPatch) -> dict[str, Recognition]:
    state = {"result": Recognition("NO_FACE")}
    monkeypatch.setattr("assistant.live.get_face_engine", lambda: object())
    monkeypatch.setattr("assistant.live.recognize", lambda engine, patient, rgb: state["result"])
    return state


@pytest.fixture
def home(world: dict[str, Any]) -> dict[str, Any]:
    patient = world["pat"]
    return {
        "kitchen": Place.objects.create(patient=patient, name="Kitchen"),
        "bedroom": Place.objects.create(patient=patient, name="Bedroom"),
        "keys": TrackedObject.objects.create(patient=patient, name="keys"),
        "glasses": TrackedObject.objects.create(patient=patient, name="glasses"),
    }


def _photo() -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 180, 160)).save(buffer, format="JPEG")
    return SimpleUploadedFile("look.jpg", buffer.getvalue(), content_type="image/jpeg")


def _look(world: dict[str, Any], **data: Any) -> Any:
    return world["pat_client"].post("/api/v1/live/look", {"image": _photo(), **data}, format="multipart")


def test_full_look_names_the_room_stores_items_and_names_the_person(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector, faces: dict[str, Any]
) -> None:
    neeraj = Person.objects.create(patient=world["pat"], name="Neeraj", relationship="Friend", consent_confirmed=True)
    faces["result"] = Recognition("RECOGNIZED", neeraj, "high")
    detector.scene = Scene("Kitchen", "a kitchen", [Detection("keys", 0.9), Detection("glasses", 0.2)], ["kettle"])

    response = _look(world, scene="true")
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert detector.calls == [(["glasses", "keys"], ["Bedroom", "Kitchen"])]
    assert data["scene"]["place"]["name"] == "Kitchen" and data["scene"]["found"] == ["keys"]
    assert data["face"]["person"]["name"] == "Neeraj"
    assert data["message"] == (
        "You are in the kitchen. I can see your keys. I'll remember they were here. "
        "This looks like Neeraj, your friend."
    )
    observation = ObjectObservation.objects.get()
    assert observation.place == home["kitchen"] and observation.tracked_object == home["keys"]
    assert last_seen_answer(world["pat"], find_object(world["pat"], "keys")).answer.startswith(
        "Your keys were last seen in the kitchen today at "
    )


def test_unnamed_room_is_described_and_used_as_the_location(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector, faces: dict[str, Any]
) -> None:
    detector.scene = Scene(None, "a garden", [Detection("glasses", 0.8)], [])
    data = _look(world, scene="true").json()["data"]
    assert data["message"] == "This looks like a garden. I can see your glasses. I'll remember they were here."
    assert "were last seen in a garden" in last_seen_answer(world["pat"], home["glasses"]).answer


def test_other_things_are_described_when_no_belongings_are_seen(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector, faces: dict[str, Any]
) -> None:
    detector.scene = Scene("Bedroom", "a bedroom", [], ["bed", "lamp"])
    assert _look(world, scene="true").json()["data"]["message"] == "You are in the bedroom. I can see bed and lamp."


def test_face_only_frames_skip_the_vision_model(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector, faces: dict[str, Any]
) -> None:
    data = _look(world).json()["data"]
    assert detector.calls == [] and data["scene"] is None and data["message"] == ""
    faces["result"] = Recognition("UNKNOWN")
    assert _look(world).json()["data"]["message"] == "I'm not sure who this is."


def test_vision_outage_still_returns_the_face_result(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector, faces: dict[str, Any]
) -> None:
    detector.fail = True
    data = _look(world, scene="true").json()["data"]
    assert data["scene_failed"] is True and data["message"] == "I couldn't look around the room just now."
    assert ObjectObservation.objects.count() == 0


def test_live_look_is_for_the_patient_only(
    world: dict[str, Any], detector: FakeDetector, faces: dict[str, Any]
) -> None:
    response = world["carol_client"].post("/api/v1/live/look", {"image": _photo()}, format="multipart")
    assert response.status_code == 403


def test_room_hint_is_passed_to_the_vision_model(
    world: dict[str, Any], home: dict[str, Any], detector: FakeDetector, faces: dict[str, Any]
) -> None:
    assert _look(world, scene="true", room_hint="Kitchen").status_code == 200
    assert detector.hint == "Kitchen"


def test_scene_prompt_mentions_only_known_rooms(monkeypatch: pytest.MonkeyPatch) -> None:
    from ai import objects

    prompts: list[str] = []

    def fake_generate(contents: list[Any], **kwargs: Any) -> str:
        prompts.append(contents[-1])
        return '{"room": "Kitchen", "room_guess": "a kitchen", "items": [], "others": []}'

    monkeypatch.setattr(objects, "image_part", lambda jpeg: jpeg)
    monkeypatch.setattr(objects, "generate", fake_generate)
    objects._describe(b"jpeg", ["keys"], ["Kitchen", "Study"], room_hint="Study")
    objects._describe(b"jpeg", ["keys"], ["Kitchen", "Study"], room_hint="Garage")
    assert "A moment ago the person was in the Study." in prompts[0]
    assert "A moment ago" not in prompts[1]
