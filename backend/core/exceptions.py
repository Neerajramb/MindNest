import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ServiceUnavailable(exceptions.APIException):
    """A dependent AI/notification service is down (API spec section 16: 503)."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "SERVICE_UNAVAILABLE"
    default_detail = "This feature is temporarily unavailable. Please try again later."


class Conflict(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "CONFLICT"
    default_detail = "This conflicts with existing data."


_CODES: list[tuple[type[Exception], str]] = [
    (exceptions.ValidationError, "VALIDATION_ERROR"),
    (exceptions.ParseError, "VALIDATION_ERROR"),
    (exceptions.NotAuthenticated, "UNAUTHENTICATED"),
    (exceptions.AuthenticationFailed, "UNAUTHENTICATED"),
    (exceptions.PermissionDenied, "FORBIDDEN"),
    (exceptions.NotFound, "NOT_FOUND"),
    (exceptions.MethodNotAllowed, "METHOD_NOT_ALLOWED"),
    (exceptions.Throttled, "RATE_LIMITED"),
    (exceptions.UnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE"),
    (ServiceUnavailable, "SERVICE_UNAVAILABLE"),
    (Conflict, "CONFLICT"),
]

_MESSAGES = {
    "VALIDATION_ERROR": "Some of the information provided is not valid.",
    "UNAUTHENTICATED": "Please sign in to continue.",
    "FORBIDDEN": "You do not have permission to do this.",
    "NOT_FOUND": "We could not find that.",
}


def envelope_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {"success": False, "error": {"code": "SERVER_ERROR", "message": "Something went wrong. Please try again."}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    code = next((c for cls, c in _CODES if isinstance(exc, cls)), "ERROR")
    error: dict[str, Any] = {"code": code}
    if isinstance(exc, exceptions.ValidationError):
        error["message"] = _MESSAGES["VALIDATION_ERROR"]
        error["details"] = response.data
    else:
        detail = response.data.get("detail") if isinstance(response.data, dict) else None
        error["message"] = str(detail) if detail else _MESSAGES.get(code, "Request failed.")
    response.data = {"success": False, "error": error}
    return response
