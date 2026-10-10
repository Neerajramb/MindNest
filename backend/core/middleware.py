import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from core.logging import request_id_var


class RequestIdMiddleware:
    """Assigns a request id (or accepts a well-formed client one) for log correlation."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        incoming = request.headers.get("X-Request-ID", "")
        valid = 8 <= len(incoming) <= 64 and incoming.replace("-", "").isalnum()
        rid = incoming if valid else uuid.uuid4().hex
        token = request_id_var.set(rid)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response["X-Request-ID"] = rid
        return response
