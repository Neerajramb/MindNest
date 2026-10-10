"""Response-generation provider: gemini | ollama | none (ADR-0006). Structured facts never come from here (ADR-0007)."""

import json
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

from ai.gemini import AIUnavailable, generate


def generate_json(system: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
    """Ask the configured LLM for a JSON object matching `schema`. Raises AIUnavailable if it cannot answer."""
    provider = settings.LLM_PROVIDER
    if provider == "gemini":
        text = generate([prompt], schema=schema, system=system)
    elif provider == "ollama":
        text = _ollama(system, prompt, schema)
    else:
        raise AIUnavailable("No language model is configured.")
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise AIUnavailable("Unreadable model response") from exc
    if not isinstance(data, dict):
        raise AIUnavailable("Unexpected model response")
    return data


def _ollama(system: str, prompt: str, schema: dict[str, Any]) -> str:
    body = json.dumps(
        {
            "model": settings.OLLAMA_MODEL,
            "system": system,
            "prompt": prompt,
            "format": schema,
            "stream": False,
            "options": {"temperature": 0},
        }
    ).encode()
    request = urllib.request.Request(  # noqa: S310 - configured local URL
        f"{settings.OLLAMA_URL.rstrip('/')}/api/generate", data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=settings.AI_TIMEOUT_SECONDS) as response:  # noqa: S310
            return str(json.loads(response.read().decode())["response"])
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
        raise AIUnavailable("Local model unavailable") from exc
