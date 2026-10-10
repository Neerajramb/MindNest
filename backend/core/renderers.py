from typing import Any

from rest_framework.renderers import JSONRenderer


class EnvelopeJSONRenderer(JSONRenderer):
    """Wraps successful payloads as {"success": true, "data": ..., "meta": ...} (API spec section 2).

    Error payloads and paginated payloads are already enveloped upstream and pass through.
    """

    def render(self, data: Any, accepted_media_type: str | None = None, renderer_context: Any = None) -> bytes:
        response = (renderer_context or {}).get("response")
        if response is None or response.status_code == 204:
            return super().render(data, accepted_media_type, renderer_context)
        if isinstance(data, dict) and "success" in data:
            return super().render(data, accepted_media_type, renderer_context)
        if response.status_code >= 400:
            data = {"success": False, "error": {"code": "ERROR", "message": str(data)}}
        else:
            data = {"success": True, "data": data, "meta": {}}
        return super().render(data, accepted_media_type, renderer_context)
