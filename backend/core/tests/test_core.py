import logging

import pytest
from rest_framework.test import APIClient

from core.logging import RedactSensitiveFilter


@pytest.mark.django_db
def test_health_is_public_and_enveloped() -> None:
    response = APIClient().get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"status": "ok"}, "meta": {}}
    assert response["X-Request-ID"]


@pytest.mark.django_db
def test_unknown_route_is_404() -> None:
    assert APIClient().get("/api/v1/does-not-exist").status_code == 404


@pytest.mark.django_db
def test_openapi_schema_generates() -> None:
    response = APIClient().get("/api/schema")
    assert response.status_code == 200


def test_log_redaction_removes_secrets_and_emails() -> None:
    text = "password=hunter2 token: abc user a.b@example.com"
    record = logging.LogRecord("t", logging.INFO, "f", 1, text, None, None)
    RedactSensitiveFilter().filter(record)
    message = record.getMessage()
    assert "hunter2" not in message
    assert "abc" not in message
    assert "example.com" not in message
