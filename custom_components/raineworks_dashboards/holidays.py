"""The holiday on or leading up to a day: the dashboards' calendar (lib/holidays.ts),
for the announcements' holiday chime.

The same holidays, days and lead-up days; a holiday's own day wins over another's
lead-up, and between two lead-ups the nearer holiday wins. tests/fixtures/
holidays.json, written from the TypeScript, keeps the two in step day by day.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """The nth weekday (0 = Sunday, as the TypeScript counts) of a month (1-12)."""
    first = (date(year, month, 1).weekday() + 1) % 7  # Monday 0 → Sunday 0
    return date(year, month, 1 + (weekday - first + 7) % 7 + (n - 1) * 7)


def easter_sunday(year: int) -> date:
    """Easter Sunday (the Anonymous Gregorian computus)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    month, day = divmod(h + ell - 7 * m + 114, 31)
    return date(year, month, day + 1)


@dataclass(frozen=True, slots=True)
class Holiday:
    id: str
    lead_days: int
    # Its days in a year, in order (the last is the main day)
    days: Callable[[int], list[date]]


HOLIDAYS: tuple[Holiday, ...] = (
    Holiday("new-year", 1, lambda y: [date(y - 1, 12, 31), date(y, 1, 1)]),
    Holiday("valentines", 7, lambda y: [date(y, 2, 14)]),
    Holiday("st-patricks", 7, lambda y: [date(y, 3, 17)]),
    Holiday("easter", 7, lambda y: [easter_sunday(y)]),
    Holiday("mothers-day", 7, lambda y: [nth_weekday(y, 5, 0, 2)]),
    Holiday("fathers-day", 7, lambda y: [nth_weekday(y, 6, 0, 3)]),
    Holiday("independence-day", 7, lambda y: [date(y, 7, 4)]),
    Holiday("halloween", 14, lambda y: [date(y, 10, 31)]),
    Holiday("thanksgiving", 7, lambda y: [nth_weekday(y, 11, 4, 4)]),
    Holiday("christmas", 14, lambda y: [date(y, 12, 24), date(y, 12, 25)]),
)

# Each holiday's sounds (holiday/sounds/<clip>.mp3), one picked at random as the chime
HOLIDAY_SOUNDS: dict[str, tuple[str, ...]] = {
    "new-year": ("new-year-horn", "new-year-cork"),
    "valentines": ("valentines-smooch",),
    "st-patricks": ("st-patricks-coins",),
    "easter": ("easter-chirp",),
    "mothers-day": ("mothers-day-nightingale",),
    "fathers-day": ("fathers-day-sizzle",),
    "independence-day": ("independence-day-fireworks",),
    "halloween": ("halloween-owl",),
    "thanksgiving": ("thanksgiving-gobble",),
    "christmas": ("christmas-bells",),
}


def active_holiday(today: date) -> str | None:
    """The id of the holiday on or leading up to `today`, else None."""
    best: tuple[bool, int, str] | None = (
        None  # (is its own day, days until its main day, id)
    )
    for holiday in HOLIDAYS:
        # New Year's next year starts this Dec 31
        for year in (today.year, today.year + 1):
            days = holiday.days(year)
            own = today in days
            until_first = (days[0] - today).days
            if not own and (until_first < 0 or until_first > holiday.lead_days):
                continue
            candidate = (own, (days[-1] - today).days, holiday.id)
            if (
                best is None
                or (own and not best[0])
                or (own == best[0] and candidate[1] < best[1])
            ):
                best = candidate
    return best[2] if best else None


def daily(start: date, count: int) -> list[str | None]:
    """The holiday of each of `count` days from `start` (the fixture's shape)."""
    return [active_holiday(start + timedelta(days=n)) for n in range(count)]
