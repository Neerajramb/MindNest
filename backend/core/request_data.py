from typing import Any

from rest_framework.request import Request


def field(request: Request, name: str) -> Any:
    """A single request-body field, whether the body was JSON or multipart."""
    data = request.data
    return data.get(name) if hasattr(data, "get") else None
