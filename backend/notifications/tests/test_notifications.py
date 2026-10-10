import io
import json
from datetime import timedelta
from typing import Any
from unittest import mock

import pytest
from django.utils import timezone

from notifications.models import Alert, AlertType, DeliveryStatus, Device, Notification, Severity
from notifications.push import PushError, send_expo_push
from notifications.service import MAX_ATTEMPTS, create_alert, deliver_pending

pytestmark = pytest.mark.django_db

TOKEN = "ExponentPushToken[abc123]"


def _alert(world: dict[str, Any]) -> Alert:
    return create_alert(world["pat"], AlertType.SYSTEM, Severity.INFO, "Test alert")


def test_delivery_without_device_is_marked_in_app_only(world: dict[str, Any]) -> None:
    _alert(world)
    assert deliver_pending(sender=mock.Mock()) == 0
    assert Notification.objects.get().status == DeliveryStatus.NO_DEVICE


def test_delivery_success_and_unregistered_device_cleanup(world: dict[str, Any]) -> None:
    Device.objects.create(user=world["carol"], expo_push_token=TOKEN)
    _alert(world)
    sender = mock.Mock(return_value=[TOKEN])
    assert deliver_pending(sender=sender) == 1
    assert Notification.objects.get().status == DeliveryStatus.SENT
    assert not Device.objects.exists()


def test_delivery_failure_backs_off_then_gives_up(world: dict[str, Any]) -> None:
    Device.objects.create(user=world["carol"], expo_push_token=TOKEN)
    _alert(world)
    sender = mock.Mock(side_effect=PushError("down"))
    deliver_pending(sender=sender)
    notification = Notification.objects.get()
    assert notification.attempts == 1
    assert notification.status == DeliveryStatus.PENDING
    assert notification.next_attempt_at is not None
    assert notification.next_attempt_at > timezone.now()
    for day in range(1, MAX_ATTEMPTS + 1):  # the clock moves past each backoff
        deliver_pending(sender=sender, now=timezone.now() + timedelta(days=day))
    notification.refresh_from_db()
    assert notification.status == DeliveryStatus.FAILED
    assert notification.attempts == MAX_ATTEMPTS


def _fake_response(payload: dict[str, Any]) -> mock.MagicMock:
    response = mock.MagicMock()
    response.__enter__.return_value = io.BytesIO(json.dumps(payload).encode())
    return response


def test_expo_client_reports_unregistered_tokens() -> None:
    payload = {"data": [{"status": "ok"}, {"status": "error", "details": {"error": "DeviceNotRegistered"}}]}
    with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)):
        assert send_expo_push(["a", "b"], "t", "b", {}) == ["b"]


def test_expo_client_raises_when_nothing_accepted() -> None:
    payload = {"data": [{"status": "error", "details": {"error": "MessageRateExceeded"}}]}
    with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)), pytest.raises(PushError):
        send_expo_push(["a"], "t", "b", {})


def test_caregiver_lists_and_acknowledges_alerts(world: dict[str, Any]) -> None:
    alert = _alert(world)
    unacked = world["carol_client"].get("/api/v1/alerts?unacknowledged=true").json()["data"]
    assert [a["id"] for a in unacked] == [str(alert.id)]
    assert world["dave_client"].get("/api/v1/alerts").json()["data"] == []
    assert world["dave_client"].post(f"/api/v1/alerts/{alert.id}/acknowledge").status_code == 404
    assert world["pat_client"].post(f"/api/v1/alerts/{alert.id}/acknowledge").status_code == 403

    acked = world["carol_client"].post(f"/api/v1/alerts/{alert.id}/acknowledge").json()["data"]
    assert acked["acknowledged_by_name"] == world["carol"].name
    assert world["carol_client"].get("/api/v1/alerts?unacknowledged=true").json()["data"] == []
    own = world["pat_client"].get(f"/api/v1/patients/{world['pat'].id}/alerts").json()["data"]
    assert len(own) == 1


def test_device_registration_validates_and_reassigns_token(world: dict[str, Any]) -> None:
    assert world["carol_client"].post("/api/v1/devices", {"expo_push_token": "nope"}).status_code == 400
    assert (
        world["carol_client"].post("/api/v1/devices", {"expo_push_token": TOKEN, "platform": "ios"}).status_code == 201
    )
    assert world["dave_client"].post("/api/v1/devices", {"expo_push_token": TOKEN}).status_code == 201
    assert Device.objects.get().user == world["dave"]
    assert world["dave_client"].delete("/api/v1/devices", {"expo_push_token": TOKEN}).status_code == 204
    assert not Device.objects.exists()
