import logging
import re
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_PATTERNS = [
    (
        re.compile(r"(?i)(authorization|password|token|api[_-]?key|secret)([\"']?\s*[:=]\s*[\"']?)[^\s,\"'}]+"),
        r"\1\2[REDACTED]",
    ),
    (re.compile(r"Bearer\s+[A-Za-z0-9._\-]+"), "Bearer [REDACTED]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[EMAIL]"),
]


class RedactSensitiveFilter(logging.Filter):
    """Strips credentials and email addresses from log messages (API spec section 17)."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for pattern, replacement in _PATTERNS:
            message = pattern.sub(replacement, message)
        record.msg, record.args = message, None
        return True


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True
