"""Conversation memory: ingestion, local semantic search and deletion (RAG-01..05, FR-015..018)."""

from dataclasses import dataclass
from datetime import datetime

import numpy as np
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from ai.embeddings import Embedder
from ai.speech import Segment
from audit.service import log_event
from care.models import Patient
from memory.models import Conversation, ConversationMessage, ConversationSource, Memory, Retention, Speaker
from people.models import Person

CHUNK_CHARS = 400
PERSON_BOOST = 0.10  # RAG-05: prefer memories with the recognised person, without excluding others
TOP_K = 4


def speaker_label(speaker: str, person: Person | None) -> str:
    if speaker == "PATIENT":
        return "You"
    return person.name if person else "Someone"


def chunk(segments: list[Segment], person: Person | None) -> list[str]:
    """Group consecutive turns into short chunks that keep who said what (AI spec section 11)."""
    chunks: list[str] = []
    current = ""
    for seg in segments:
        line = f"{speaker_label(seg.speaker, person)}: {seg.text}"
        if current and len(current) + len(line) + 1 > CHUNK_CHARS:
            chunks.append(current)
            current = line
        else:
            current = f"{current}\n{line}" if current else line
    if current:
        chunks.append(current)
    return chunks


def _store_segments(
    embedder: Embedder,
    conversation: Conversation,
    segments: list[Segment],
    *,
    person: Person | None,
    first_position: int,
    event_time: datetime,
) -> int:
    """Save the turns and their searchable chunks; returns how many chunks were stored."""
    ConversationMessage.objects.bulk_create(
        [
            ConversationMessage(
                conversation=conversation,
                speaker_type=Speaker.PATIENT if s.speaker == "PATIENT" else Speaker.PERSON,
                content=s.text,
                position=first_position + i,
            )
            for i, s in enumerate(segments)
        ]
    )
    texts = chunk(segments, person)
    if texts:
        vectors = embedder.embed(texts)
        Memory.objects.bulk_create(
            [
                Memory(
                    patient=conversation.patient,
                    conversation=conversation,
                    recognized_person=person,
                    content=text,
                    vector=vector.astype(np.float32).tobytes(),
                    event_time=event_time,
                )
                for text, vector in zip(texts, vectors, strict=True)
            ]
        )
    return len(texts)


@transaction.atomic
def ingest(
    embedder: Embedder,
    patient: Patient,
    segments: list[Segment],
    *,
    source: str,
    person: Person | None,
    user: User,
    started_at: datetime | None = None,
) -> Conversation:
    started_at = started_at or timezone.now()
    conversation = Conversation.objects.create(
        patient=patient,
        recognized_person=person,
        started_at=started_at,
        ended_at=timezone.now(),
        source=source,
        consent_confirmed=True,
        created_by=user,
    )
    chunks = _store_segments(embedder, conversation, segments, person=person, first_position=0, event_time=started_at)
    log_event(
        "memory.saved",
        actor=user,
        patient=patient,
        source=source,
        person=person.name if person else None,
        chunks=chunks,
    )
    return conversation


@transaction.atomic
def append(
    embedder: Embedder, conversation: Conversation, segments: list[Segment], *, person: Person | None, user: User
) -> Conversation:
    """Add the next part of an ongoing recorded conversation (AR Vision saves one conversation in short parts)."""
    now = timezone.now()
    chunks = _store_segments(
        embedder,
        conversation,
        segments,
        person=person,
        first_position=conversation.messages.count(),
        event_time=now,
    )
    conversation.ended_at = now
    if person is not None and conversation.recognized_person_id is None:
        conversation.recognized_person = person
    conversation.save(update_fields=["ended_at", "recognized_person"])
    log_event(
        "memory.saved",
        actor=user,
        patient=conversation.patient,
        source=conversation.source,
        person=person.name if person else None,
        chunks=chunks,
        appended=True,
    )
    return conversation


def text_note_segments(text: str) -> list[Segment]:
    return [Segment("PATIENT", line.strip()) for line in text.splitlines() if line.strip()]


@dataclass
class Hit:
    memory: Memory
    score: float


def search(
    embedder: Embedder, patient: Patient, query: str, *, person: Person | None = None, top_k: int = TOP_K
) -> list[Hit]:
    """Semantic search restricted to this patient's kept memories (AI spec section 21: scope before retrieval)."""
    candidates = list(
        Memory.objects.filter(patient=patient, conversation__retention_status=Retention.ACTIVE).select_related(
            "recognized_person", "conversation"
        )
    )
    if not candidates or not query.strip():
        return []
    query_vector = embedder.embed([query])[0]
    matrix = np.stack([m.as_array() for m in candidates])
    scores = matrix @ query_vector
    hits = []
    for memory, score in zip(candidates, scores, strict=True):
        boosted = float(score) + (PERSON_BOOST if person and memory.recognized_person_id == person.id else 0.0)
        if float(score) >= settings.MEMORY_MIN_SIMILARITY:
            hits.append(Hit(memory, boosted))
    return sorted(hits, key=lambda h: h.score, reverse=True)[:top_k]


@transaction.atomic
def retire(conversation: Conversation, user: User) -> None:
    """Deletion path (DB spec section 8): transcript and vectors go; only the deleted marker remains."""
    conversation.memories.all().delete()
    conversation.messages.all().delete()
    conversation.retention_status = Retention.RETIRED
    conversation.save(update_fields=["retention_status"])
    log_event("memory.deleted", actor=user, patient=conversation.patient)


__all__ = ["ConversationSource", "Hit", "append", "chunk", "ingest", "retire", "search", "text_note_segments"]
