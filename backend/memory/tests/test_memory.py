"""FR-015..018, RAG-01..05, AC-06, TC-010/TC-011, privacy and deletion rules."""

from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

import ai.embeddings
from ai.gemini import AIUnavailable
from ai.speech import Segment
from ai.testing import WordOverlapEmbedder
from care.models import MemoryAccess
from memory.models import Conversation, Memory, Retention
from memory.service import chunk, ingest, search
from people.models import Person

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def fake_embedder(monkeypatch: pytest.MonkeyPatch) -> WordOverlapEmbedder:
    embedder = WordOverlapEmbedder()
    monkeypatch.setattr(ai.embeddings, "_embedder", embedder)
    return embedder


@pytest.fixture
def sarah(world: dict[str, Any]) -> Person:
    return Person.objects.create(patient=world["pat"], name="Sarah", relationship="Daughter", consent_confirmed=True)


def _note(world: dict[str, Any], text: str, **extra: Any) -> Any:
    return world["pat_client"].post("/api/v1/conversations/note", {"text": text, **extra}, format="json")


def test_chunks_keep_who_said_what_and_stay_short(sarah: Person) -> None:
    segments = [
        Segment("OTHER", "word " * 60),
        Segment("PATIENT", "Lovely, see you then."),
        Segment("OTHER", "x " * 150),
    ]
    chunks = chunk(segments, sarah)
    assert chunks[0].startswith("Sarah: word")
    assert "You: Lovely, see you then." in chunks[0]
    assert all(len(c) <= 400 for c in chunks)
    assert len(chunks) == 2


def test_tc010_note_is_stored_as_searchable_memory(world: dict[str, Any], sarah: Person) -> None:
    response = _note(world, "Sarah is visiting on Sunday with the grandchildren", person_id=str(sarah.id))
    assert response.status_code == 201
    memory = Memory.objects.get()
    assert memory.recognized_person == sarah
    assert memory.content == "You: Sarah is visiting on Sunday with the grandchildren"
    assert len(memory.as_array()) == 384


def test_tc011_ac06_semantic_search_finds_related_memory(world: dict[str, Any], fake_embedder: Any) -> None:
    patient, user = world["pat"], world["pat"].user
    ingest(
        fake_embedder,
        patient,
        [Segment("OTHER", "The electrician is coming Tuesday to fix the kitchen light")],
        source="TEXT",
        person=None,
        user=user,
    )
    ingest(
        fake_embedder,
        patient,
        [Segment("OTHER", "We planted tomatoes in the garden")],
        source="TEXT",
        person=None,
        user=user,
    )
    hits = search(fake_embedder, patient, "when is the electrician coming to fix the light")
    assert hits and "electrician" in hits[0].memory.content


def test_ac07_recognised_person_is_preferred(world: dict[str, Any], fake_embedder: Any, sarah: Person) -> None:
    patient, user = world["pat"], world["pat"].user
    ravi = Person.objects.create(patient=patient, name="Ravi", consent_confirmed=True)
    ingest(
        fake_embedder,
        patient,
        [Segment("OTHER", "We talked about the cricket match")],
        source="TEXT",
        person=ravi,
        user=user,
    )
    ingest(
        fake_embedder,
        patient,
        [Segment("OTHER", "We talked about the cricket match")],
        source="TEXT",
        person=sarah,
        user=user,
    )
    assert search(fake_embedder, patient, "cricket match", person=sarah)[0].memory.recognized_person == sarah
    assert search(fake_embedder, patient, "cricket match", person=ravi)[0].memory.recognized_person == ravi


def test_search_never_crosses_patients(world: dict[str, Any], fake_embedder: Any) -> None:
    ingest(
        fake_embedder,
        world["other"],
        [Segment("OTHER", "secret bank code is 1234")],
        source="TEXT",
        person=None,
        user=world["other"].user,
    )
    assert search(fake_embedder, world["pat"], "secret bank code") == []
    response = world["pat_client"].post("/api/v1/memory/search", {"query": "secret bank code"}, format="json")
    assert response.json()["data"] == []


def test_recording_requires_consent_and_discards_audio(world: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "memory.views.transcribe_conversation", lambda audio, ext: [Segment("OTHER", "Dinner is at eight tonight")]
    )
    audio = SimpleUploadedFile("talk.m4a", b"fake-audio-bytes", content_type="audio/mp4")
    no_consent = world["pat_client"].post("/api/v1/conversations/record", {"audio": audio}, format="multipart")
    assert no_consent.status_code == 400
    audio.seek(0)
    ok = world["pat_client"].post(
        "/api/v1/conversations/record", {"audio": audio, "consent_confirmed": "true"}, format="multipart"
    )
    assert ok.status_code == 201
    assert ok.json()["data"]["messages"] == [{"speaker": "PERSON", "text": "Dinner is at eight tonight"}]
    assert Conversation.objects.get().source == "VOICE"


def test_recording_failures(world: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    def down(audio: bytes, ext: str) -> list[Segment]:
        raise AIUnavailable("down")

    monkeypatch.setattr("memory.views.transcribe_conversation", down)
    audio = SimpleUploadedFile("talk.m4a", b"x", content_type="audio/mp4")
    response = world["pat_client"].post(
        "/api/v1/conversations/record", {"audio": audio, "consent_confirmed": "true"}, format="multipart"
    )
    assert response.status_code == 503
    bad = SimpleUploadedFile("talk.exe", b"x")
    assert (
        world["pat_client"]
        .post("/api/v1/conversations/record", {"audio": bad, "consent_confirmed": "true"}, format="multipart")
        .status_code
        == 400
    )
    assert not Conversation.objects.exists()


def test_deleting_a_conversation_removes_transcript_and_vectors(world: dict[str, Any]) -> None:
    conversation_id = _note(world, "Remember the pharmacy closes at six").json()["data"]["id"]
    assert world["other_client"].delete(f"/api/v1/conversations/{conversation_id}").status_code == 404
    assert world["pat_client"].delete(f"/api/v1/conversations/{conversation_id}").status_code == 204
    conversation = Conversation.objects.get(pk=conversation_id)
    assert conversation.retention_status == Retention.RETIRED
    assert not Memory.objects.exists() and not conversation.messages.exists()


@pytest.mark.parametrize(
    "access,status,has_text",
    [(MemoryAccess.NONE, 403, None), (MemoryAccess.METADATA, 200, False), (MemoryAccess.FULL, 200, True)],
)
def test_caregiver_sees_only_what_patient_allows(
    world: dict[str, Any], sarah: Person, access: str, status: int, has_text: bool | None
) -> None:
    _note(world, "Sarah's birthday is on the fifth", person_id=str(sarah.id))
    world["pat"].caregiver_memory_access = access
    world["pat"].save()
    response = world["carol_client"].get(f"/api/v1/patients/{world['pat'].id}/conversations")
    assert response.status_code == status
    if status == 200:
        item = response.json()["data"]["conversations"][0]
        assert item["person"]["name"] == "Sarah"
        assert ("messages" in item) is has_text
    assert world["dave_client"].get(f"/api/v1/patients/{world['pat'].id}/conversations").status_code == 404


def test_person_from_another_patient_is_rejected(world: dict[str, Any]) -> None:
    stranger = Person.objects.create(patient=world["other"], name="Stranger", consent_confirmed=True)
    assert _note(world, "hello", person_id=str(stranger.id)).status_code == 404
