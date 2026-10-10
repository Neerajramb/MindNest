"""Shared Gemini client (google-genai).

Free-tier note (ADR-0006, KI-01): Google may use free-tier inputs for training and human review, so only
synthetic/demo data may be sent. Every call goes through here so the provider can be swapped in one place.
"""

import logging
import threading
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


class AIUnavailable(RuntimeError):
    """The external AI service is not configured or did not answer; callers degrade gracefully."""


_client: Any = None
_lock = threading.Lock()


def get_client() -> Any:
    global _client
    if not settings.GEMINI_API_KEY:
        logger.warning(
            "Gemini is not configured: GEMINI_API_KEY is empty in this process (restart after editing .env)."
        )
        raise AIUnavailable("Gemini is not configured (GEMINI_API_KEY is empty).")
    if _client is None:
        with _lock:
            if _client is None:
                from google import genai
                from google.genai import types

                _client = genai.Client(
                    api_key=settings.GEMINI_API_KEY,
                    http_options=types.HttpOptions(timeout=int(settings.AI_TIMEOUT_SECONDS * 1000)),
                )
    return _client


def generate(contents: list[Any], *, schema: dict[str, Any] | None = None, system: str | None = None) -> str:
    """Call the configured model and return its text. Raises AIUnavailable on any provider failure."""
    from google.genai import types

    config: dict[str, Any] = {"temperature": 0}
    if schema is not None:
        config.update(response_mime_type="application/json", response_schema=schema)
    if system:
        config["system_instruction"] = system
    try:
        response = get_client().models.generate_content(
            model=settings.GEMINI_MODEL, contents=contents, config=types.GenerateContentConfig(**config)
        )
    except AIUnavailable:
        raise
    except Exception as exc:  # network, quota, safety block: all mean "not available right now"
        logger.warning("Gemini call failed: %s", type(exc).__name__)
        raise AIUnavailable(type(exc).__name__) from exc
    text = getattr(response, "text", None)
    if not text:
        raise AIUnavailable("Empty response")
    return str(text)


def image_part(jpeg: bytes) -> Any:
    from google.genai import types

    return types.Part.from_bytes(data=jpeg, mime_type="image/jpeg")
