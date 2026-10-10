"""RFC 5545 recurrence rules evaluated in the patient's local time.

Rules are stored without DTSTART (for example "FREQ=DAILY" or "FREQ=WEEKLY;BYDAY=MO,WE,FR").
Occurrences are computed as local wall-clock times and then converted to UTC, so "08:00 every day"
stays at 08:00 for the patient across daylight-saving changes.
"""

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from dateutil.rrule import rrulestr

ALLOWED_FREQUENCIES = {"DAILY", "WEEKLY", "MONTHLY"}
_FORBIDDEN_PARTS = {"DTSTART", "BYSECOND", "BYMINUTE", "BYHOUR"}


class InvalidRecurrence(ValueError):
    pass


def normalize_rule(rule: str) -> str:
    """Validate and normalize a recurrence rule. Raises InvalidRecurrence."""
    text = rule.strip().upper().removeprefix("RRULE:")
    if not text:
        raise InvalidRecurrence("A repeat rule is required.")
    parts = dict(part.split("=", 1) for part in text.split(";") if "=" in part)
    if parts.get("FREQ") not in ALLOWED_FREQUENCIES:
        raise InvalidRecurrence("Repeat must be daily, weekly or monthly.")
    if _FORBIDDEN_PARTS & parts.keys():
        raise InvalidRecurrence("The time of day is set separately; remove it from the repeat rule.")
    try:
        rrulestr(text, dtstart=datetime(2000, 1, 1))
    except (ValueError, TypeError) as exc:
        raise InvalidRecurrence("The repeat rule is not valid.") from exc
    return text


def occurrences_between(
    rule: str,
    *,
    start_date: date,
    end_date: date | None,
    time_of_day: time,
    tz: ZoneInfo,
    window_start: datetime,
    window_end: datetime,
) -> list[datetime]:
    """UTC datetimes of occurrences within [window_start, window_end] (both aware)."""
    local_start = window_start.astimezone(tz).replace(tzinfo=None)
    local_end = window_end.astimezone(tz).replace(tzinfo=None)
    series = rrulestr(rule, dtstart=datetime.combine(start_date, time_of_day))
    result = []
    for naive in series.between(local_start, local_end, inc=True):
        if end_date is not None and naive.date() > end_date:
            break
        result.append(naive.replace(tzinfo=tz).astimezone(UTC))
    return result
