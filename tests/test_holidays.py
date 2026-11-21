"""The integration's holiday calendar is the dashboards' (fixtures/holidays.json)."""

from datetime import date
import json
from pathlib import Path

from custom_components.raineworks_dashboards.holidays import (
    HOLIDAY_SOUNDS,
    HOLIDAYS,
    active_holiday,
    daily,
    easter_sunday,
)

ROOT = Path(__file__).parent.parent
SOUNDS = ROOT / "packages/ui/src/components/holiday/sounds"


def test_every_day_matches_the_dashboards() -> None:
    fixture = json.loads((Path(__file__).parent / "fixtures/holidays.json").read_text())
    days = fixture["days"]
    assert daily(date.fromisoformat(fixture["start"]), len(days)) == days


def test_a_few_known_days() -> None:
    assert easter_sunday(2027) == date(2027, 3, 28)
    assert active_holiday(date(2026, 11, 21)) == "thanksgiving"
    assert active_holiday(date(2026, 12, 30)) == "new-year"
    assert active_holiday(date(2026, 8, 1)) is None


def test_every_holiday_has_its_sounds() -> None:
    assert set(HOLIDAY_SOUNDS) == {h.id for h in HOLIDAYS}
    for clips in HOLIDAY_SOUNDS.values():
        for clip in clips:
            assert (SOUNDS / f"{clip}.mp3").is_file(), clip
