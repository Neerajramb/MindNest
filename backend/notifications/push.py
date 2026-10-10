"""Minimal Expo push client (https://docs.expo.dev/push-notifications/sending-notifications/)."""

import json
import logging
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class PushError(Exception):
    """Transient delivery failure; the outbox will retry."""


def send_expo_push(tokens: list[str], title: str, body: str, data: dict[str, Any]) -> list[str]:
    """Send one message per token. Returns tokens Expo reports as no longer registered.

    Raises PushError if Expo did not accept any message.
    """
    messages = [{"to": token, "title": title, "body": body, "data": data, "sound": "default"} for token in tokens]
    request = urllib.request.Request(
        EXPO_PUSH_URL,
        data=json.dumps(messages).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310
            payload = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise PushError(f"Push service unreachable: {exc.__class__.__name__}") from exc

    tickets = payload.get("data") or []
    unregistered = [
        token
        for token, ticket in zip(tokens, tickets, strict=False)
        if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
    ]
    if not any(ticket.get("status") == "ok" for ticket in tickets):
        raise PushError("Push service accepted no messages.")
    return unregistered
