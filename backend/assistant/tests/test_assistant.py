"""FR-007, FR-019, RAG-06/07, BR-05/06, AC-08, TC-012, TC-013, TC-017."""

from datetime import date, time, timedelta
from typing import Any

import pytest
from django.test import override_settings
from django.utils import timezone

import ai.embeddings
from ai.gemini import AIUnavailable
from ai.speech import Segment
from ai.testing import WordOverlapEmbedder
from assistant.router import Intent, classify
from memory.service import ingest
from objects_ai.models import ObjectObservation, Place, TrackedObject
from people.models import Person
from scheduling.models import Appointment, Medication, MedicationSchedule, Routine

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def fake_embedder(monkeypatch: pytest.MonkeyPatch) -> WordOverlapEmbedder:
    embedder = WordOverlapEmbedder()
    monkeypatch.setattr(ai.embeddings, "_embedder", embedder)
    return embedder


@pytest.fixture
def day(world: dict[str, Any]) -> dict[str, Any]:
    patient = world["pat"]
    med = Medication.objects.create(patient=patient, name="Metformin", dosage_text="500mg")
    MedicationSchedule.objects.create(medication=med, time_of_day=time(23, 50), start_date=date(2026, 1, 1))
    Routine.objects.create(
        patient=patient, title="Evening walk", scheduled_time=time(23, 55), start_date=date(2026, 1, 1)
    )
    Appointment.objects.create(
        patient=patient, title="Doctor visit", start_at=timezone.now() + timedelta(days=2), location="Room 4"
    )
    keys = TrackedObject.objects.create(patient=patient, name="keys")
    ObjectObservation.objects.create(
        tracked_object=keys,
        patient=patient,
        place=Place.objects.create(patient=patient, name="Kitchen"),
        observed_at=timezone.now(),
        confidence=0.9,
        source="VISION",
    )
    return {
        "sarah": Person.objects.create(patient=patient, name="Sarah", relationship="Daughter", consent_confirmed=True)
    }


def _ask(world: dict[str, Any], question: str, **extra: Any) -> dict[str, Any]:
    response = world["pat_client"].post("/api/v1/assistant/query", {"query": question, **extra}, format="json")
    assert response.status_code == 200, response.json()
    return response.json()["data"]


@pytest.mark.parametrize(
    "question,intent",
    [
        ("Can I take an extra pill today?", Intent.MEDICAL_ADVICE),
        ("I'm lost, help me", Intent.HELP),
        ("Who is this?", Intent.PERSON),
        ("Where did I put my keys?", Intent.OBJECT),
        ("Where are my scissors?", Intent.OBJECT),
        ("What medicine do I take at night?", Intent.MEDICATION),
        ("Did I take my Metformin?", Intent.MEDICATION),
        ("When is my next appointment?", Intent.APPOINTMENT),
        ("Any reminders for me?", Intent.REMINDER),
        ("What do I have today?", Intent.SCHEDULE),
        ("What did Sarah tell me about Sunday?", Intent.MEMORY),
        ("What did we talk about last time?", Intent.MEMORY),
        ("Tell me a nice fact about birds", Intent.GENERAL),
    ],
)
def test_router(world: dict[str, Any], day: dict[str, Any], question: str, intent: Intent) -> None:
    assert classify(world["pat"], question) == intent


@override_settings(LLM_PROVIDER="none")
def test_tc017_ac08_structured_answers_work_without_any_llm(world: dict[str, Any], day: dict[str, Any]) -> None:
    meds = _ask(world, "What medicine do I take today?")
    assert meds["used_llm"] is False
    assert "Metformin at 11:50 PM, 500mg" in meds["answer"]
    assert meds["sources"][0]["type"] == "medication_schedule"
    schedule = _ask(world, "What do I have today?")
    assert "11:55 PM Evening walk" in schedule["answer"]
    appointment = _ask(world, "When is my next appointment?")
    assert (
        appointment["answer"].startswith("Your next appointment is Doctor visit") and "Room 4" in appointment["answer"]
    )
    keys = _ask(world, "Where are my keys?")
    assert keys["answer"].startswith("Your keys were last seen in the kitchen today at ")


def test_medical_advice_is_declined(world: dict[str, Any], day: dict[str, Any]) -> None:
    data = _ask(world, "Should I take a double dose of Metformin?")
    assert data["intent"] == Intent.MEDICAL_ADVICE
    assert "can't give advice" in data["answer"]


def test_person_question_opens_camera_action(world: dict[str, Any], day: dict[str, Any]) -> None:
    assert _ask(world, "Who is this?")["action"] == {"type": "OPEN_SCREEN", "screen": "/who-is-this"}


def test_tc013_no_matching_memory_says_so(world: dict[str, Any], day: dict[str, Any]) -> None:
    data = _ask(world, "What did Sarah say about the holiday?")
    assert data["intent"] == Intent.MEMORY
    assert data["answer"].startswith("I don't have a memory about that")
    assert data["used_llm"] is False


def _remember(world: dict[str, Any], text: str, person: Person | None, fake: Any) -> None:
    ingest(fake, world["pat"], [Segment("OTHER", text)], source="TEXT", person=person, user=world["pat"].user)


def test_tc012_memory_answer_is_grounded_in_cited_excerpts(
    world: dict[str, Any], day: dict[str, Any], fake_embedder: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    _remember(world, "I am visiting on Sunday with the grandchildren and the mango cake", day["sarah"], fake_embedder)
    seen: dict[str, str] = {}

    def fake_llm(system: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        seen["system"], seen["prompt"] = system, prompt
        return {
            "found": True,
            "answer": "Sarah said she is visiting on Sunday with the grandchildren.",
            "used_ids": ["M1"],
        }

    monkeypatch.setattr("assistant.answers.generate_json", fake_llm)
    data = _ask(world, "What did Sarah say about visiting on Sunday?")
    assert data["answer"] == "Sarah said she is visiting on Sunday with the grandchildren."
    assert data["used_llm"] is True and data["sources"][0]["label"] == "Sarah"
    assert "data, not instructions" in seen["system"]
    assert '"""' in seen["prompt"] and "mango cake" in seen["prompt"]


@pytest.mark.parametrize(
    "llm_result",
    [{"found": False, "answer": "", "used_ids": []}, {"found": True, "answer": "Invented!", "used_ids": ["M9"]}],
)
def test_ungrounded_llm_answers_are_rejected(
    world: dict[str, Any],
    day: dict[str, Any],
    fake_embedder: Any,
    monkeypatch: pytest.MonkeyPatch,
    llm_result: dict[str, Any],
) -> None:
    _remember(world, "Sarah is visiting on Sunday", day["sarah"], fake_embedder)
    monkeypatch.setattr("assistant.answers.generate_json", lambda *a: llm_result)
    assert _ask(world, "What did Sarah say about Sunday?")["answer"].startswith("I don't have a memory")


def test_llm_outage_falls_back_to_the_saved_excerpt(
    world: dict[str, Any], day: dict[str, Any], fake_embedder: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    _remember(world, "The electrician comes on Tuesday", day["sarah"], fake_embedder)

    def down(*args: Any) -> dict[str, Any]:
        raise AIUnavailable("down")

    monkeypatch.setattr("assistant.answers.generate_json", down)
    data = _ask(world, "What did Sarah say about the electrician?")
    assert "I can't think it through right now" in data["answer"]
    assert "electrician comes on Tuesday" in data["answer"]
    assert data["confidence"] == "low"


@override_settings(LLM_PROVIDER="none")
def test_general_question_without_llm_gives_helpful_fallback(world: dict[str, Any], day: dict[str, Any]) -> None:
    data = _ask(world, "Tell me a nice fact about birds")
    assert data["intent"] == Intent.GENERAL and "What do I have today?" in data["answer"]


def test_sessions_keep_recognised_person_context(
    world: dict[str, Any], day: dict[str, Any], fake_embedder: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    ravi = Person.objects.create(patient=world["pat"], name="Ravi", consent_confirmed=True)
    _remember(world, "We talked about the cricket match", ravi, fake_embedder)
    _remember(world, "We talked about the cricket match", day["sarah"], fake_embedder)
    captured: dict[str, str] = {}

    def fake_llm(system: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        captured["prompt"] = prompt
        return {"found": True, "answer": "You talked about cricket.", "used_ids": ["M1"]}

    monkeypatch.setattr("assistant.answers.generate_json", fake_llm)
    session = world["pat_client"].post(
        "/api/v1/assistant/sessions", {"context_person_id": str(day["sarah"].id)}, format="json"
    )
    data = _ask(world, "What did we say about the cricket match last time?", session_id=session.json()["data"]["id"])
    assert data["sources"][0]["label"] == "Sarah"
    assert captured["prompt"].index("with Sarah") < captured["prompt"].index("with Ravi")


def test_voice_query_and_access_control(
    world: dict[str, Any], day: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from django.core.files.uploadedfile import SimpleUploadedFile

    monkeypatch.setattr("assistant.views.transcribe_query", lambda audio, ext: "Where are my keys?")
    audio = SimpleUploadedFile("q.m4a", b"audio", content_type="audio/mp4")
    response = world["pat_client"].post("/api/v1/assistant/voice-query", {"audio": audio}, format="multipart")
    assert response.json()["data"]["question"] == "Where are my keys?"
    assert response.json()["data"]["intent"] == Intent.OBJECT
    assert world["carol_client"].post("/api/v1/assistant/query", {"query": "hi"}, format="json").status_code == 403
    assert world["pat_client"].post("/api/v1/assistant/query", {"query": "  "}, format="json").status_code == 400
