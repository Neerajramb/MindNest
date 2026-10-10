"""Speech-to-text through Gemini (RAG-02, FR-015). Audio is sent once and never stored (DB spec section 8)."""

import json
from dataclasses import dataclass
from typing import Any

from ai.gemini import AIUnavailable, generate

# Phones record AAC in an MP4 container (.m4a); try the container type first, then plain AAC.
MIME_CANDIDATES = {
    "m4a": ["audio/mp4", "audio/aac"],
    "mp4": ["audio/mp4", "audio/aac"],
    "aac": ["audio/aac"],
    "wav": ["audio/wav"],
    "mp3": ["audio/mp3"],
    "ogg": ["audio/ogg"],
    "flac": ["audio/flac"],
    "caf": ["audio/x-caf", "audio/aac"],
}


@dataclass
class Segment:
    speaker: str  # PATIENT | OTHER
    text: str


CONVERSATION_PROMPT = (
    "Transcribe this conversation exactly, in order, split into turns by speaker. The patient is the person who owns "
    "the phone (usually the older person); everyone else is OTHER. Do not add, summarise or correct anything. "
    "If nothing intelligible is said, return no segments."
)

QUERY_PROMPT = "Transcribe exactly what the speaker says. Return only the words spoken."


def _audio_part(audio: bytes, mime: str) -> Any:
    from google.genai import types

    return types.Part.from_bytes(data=audio, mime_type=mime)


def _with_mime_fallback(audio: bytes, extension: str, prompt: str, schema: dict[str, Any]) -> str:
    last: Exception | None = None
    for mime in MIME_CANDIDATES.get(extension.lower(), ["audio/mp4"]):
        try:
            return generate([_audio_part(audio, mime), prompt], schema=schema)
        except AIUnavailable as exc:
            last = exc
    raise AIUnavailable("Could not transcribe audio") from last


def transcribe_conversation(audio: bytes, extension: str) -> list[Segment]:
    schema = {
        "type": "object",
        "properties": {
            "segments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "speaker": {"type": "string", "enum": ["PATIENT", "OTHER"]},
                        "text": {"type": "string"},
                    },
                    "required": ["speaker", "text"],
                },
            }
        },
        "required": ["segments"],
    }
    text = _with_mime_fallback(audio, extension, CONVERSATION_PROMPT, schema)
    try:
        raw = json.loads(text)["segments"]
    except (ValueError, KeyError, TypeError) as exc:
        raise AIUnavailable("Unreadable transcription") from exc
    return [
        Segment(s["speaker"], s["text"].strip())
        for s in raw
        if isinstance(s, dict) and s.get("speaker") in ("PATIENT", "OTHER") and str(s.get("text", "")).strip()
    ]


def transcribe_query(audio: bytes, extension: str) -> str:
    schema = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}
    text = _with_mime_fallback(audio, extension, QUERY_PROMPT, schema)
    try:
        return str(json.loads(text)["text"]).strip()
    except (ValueError, KeyError, TypeError) as exc:
        raise AIUnavailable("Unreadable transcription") from exc
