from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

import pytest

from scheduling.recurrence import InvalidRecurrence, normalize_rule, occurrences_between

IST = ZoneInfo("Asia/Kolkata")


@pytest.mark.parametrize(
    "rule,expected",
    [
        ("FREQ=DAILY", "FREQ=DAILY"),
        ("rrule:freq=weekly;byday=mo,we", "FREQ=WEEKLY;BYDAY=MO,WE"),
        ("FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=MONTHLY;BYMONTHDAY=1"),
    ],
)
def test_valid_rules_are_normalized(rule: str, expected: str) -> None:
    assert normalize_rule(rule) == expected


@pytest.mark.parametrize("rule", ["", "FREQ=HOURLY", "FREQ=DAILY;BYHOUR=8", "FREQ=WEEKLY;BYDAY=XX", "nonsense"])
def test_invalid_rules_are_rejected(rule: str) -> None:
    with pytest.raises(InvalidRecurrence):
        normalize_rule(rule)


def test_daily_occurrences_are_local_time_converted_to_utc() -> None:
    result = occurrences_between(
        "FREQ=DAILY",
        start_date=date(2026, 10, 1),
        end_date=None,
        time_of_day=time(8, 0),
        tz=IST,
        window_start=datetime(2026, 10, 10, 0, 0, tzinfo=UTC),
        window_end=datetime(2026, 10, 11, 23, 0, tzinfo=UTC),
    )
    assert result == [datetime(2026, 10, 10, 2, 30, tzinfo=UTC), datetime(2026, 10, 11, 2, 30, tzinfo=UTC)]


def test_weekly_byday_and_end_date_are_respected() -> None:
    result = occurrences_between(
        "FREQ=WEEKLY;BYDAY=MO,FR",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 12),
        time_of_day=time(9, 0),
        tz=IST,
        window_start=datetime(2026, 10, 1, tzinfo=UTC),
        window_end=datetime(2026, 10, 31, tzinfo=UTC),
    )
    local_days = [d.astimezone(IST).date() for d in result]
    assert local_days == [date(2026, 10, 2), date(2026, 10, 5), date(2026, 10, 9), date(2026, 10, 12)]


def test_wall_clock_time_is_kept_across_daylight_saving_change() -> None:
    new_york = ZoneInfo("America/New_York")
    result = occurrences_between(
        "FREQ=DAILY",
        start_date=date(2026, 10, 30),
        end_date=None,
        time_of_day=time(8, 0),
        tz=new_york,
        window_start=datetime(2026, 10, 31, tzinfo=UTC),
        window_end=datetime(2026, 11, 3, tzinfo=UTC),
    )
    assert {d.astimezone(new_york).hour for d in result} == {8}
    assert {d.hour for d in result} == {12, 13}  # UTC offset changes on 1 Nov 2026
