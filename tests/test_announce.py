"""Announcements on the speakers and TVs, in the house's voice, keeping quiet hours."""

from datetime import datetime, time
from pathlib import Path

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.raineworks_dashboards import announce as module
from custom_components.raineworks_dashboards.announce import chime_path, in_quiet_hours

SOUNDS = Path(__file__).parent.parent / "packages/ui/src/components/holiday/sounds"
HOUSE = {
    "house": {
        "announce_speakers": ["media_player.kitchen", "media_player.ensuite"],
        "tts": {"engine": "tts.house", "voice": "eve"},
    }
}


def at(hour: int, day: int = 1, month: int = 8) -> datetime:
    return datetime(2026, month, day, hour, tzinfo=dt_util.get_default_time_zone())


@pytest.fixture
def house(hass: HomeAssistant, monkeypatch) -> dict:
    """Two speakers (the Library following the Kitchen), the Ensuite, a TV that's on."""
    monkeypatch.setattr(module, "SOUNDS", SOUNDS)
    ma = {"mass_player_type": "player"}
    hass.states.async_set(
        "media_player.kitchen",
        "idle",
        {
            **ma,
            "friendly_name": "Kitchen",
            "group_members": ["media_player.kitchen", "media_player.library"],
        },
    )
    hass.states.async_set(
        "media_player.library",
        "idle",
        {
            **ma,
            "friendly_name": "Library",
            "group_members": ["media_player.kitchen", "media_player.library"],
        },
    )
    hass.states.async_set(
        "media_player.ensuite", "idle", {**ma, "friendly_name": "Ensuite"}
    )
    hass.states.async_set(
        "media_player.garage", "unavailable", {**ma, "friendly_name": "Garage"}
    )
    er.async_get(hass).async_get_or_create(
        "media_player", "googletv", "tv", suggested_object_id="den_tv"
    )
    hass.states.async_set("media_player.den_tv", "playing")
    hass.states.async_set("tts.house", "unknown")
    return {
        "say": async_mock_service(
            hass,
            "chime_tts",
            "say_url",
            response={"url": "https://ha.example/chime/abc.mp3"},
            supports_response=SupportsResponse.ONLY,
        ),
        "announce": async_mock_service(hass, "music_assistant", "play_announcement"),
        "tv": async_mock_service(hass, "media_player", "play_media"),
    }


async def say(hass: HomeAssistant, **data):
    return await hass.services.async_call(
        "raineworks_dashboards",
        "announce",
        {"message": "Dinner is ready", **data},
        blocking=True,
        return_response=True,
    )


def test_quiet_hours() -> None:
    assert in_quiet_hours(time(23), time(22), time(7))
    assert in_quiet_hours(time(6, 59), time(22), time(7))
    assert not in_quiet_hours(time(7), time(22), time(7))
    assert in_quiet_hours(time(13), time(12), time(14))


def test_the_holidays_chime(monkeypatch) -> None:
    halloween = at(12, day=31, month=10)
    assert Path(chime_path(None, True, halloween, SOUNDS)).name == "halloween-owl.mp3"
    assert chime_path(None, False, halloween, SOUNDS) is None
    assert chime_path(None, True, at(12), SOUNDS) is None
    assert (
        Path(chime_path("new-year-horn", False, at(12), SOUNDS)).name
        == "new-year-horn.mp3"
    )
    assert chime_path("no-such-sound", False, at(12), SOUNDS) is None


async def test_one_per_group_and_the_tvs(
    hass: HomeAssistant, house, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(at(12))
    await setup(HOUSE)
    response = await say(hass)
    # The Library follows the Kitchen: the Kitchen leads, and says it once for both
    assert response == {
        "speakers": ["media_player.kitchen", "media_player.ensuite"],
        "tvs": ["media_player.den_tv"],
        "chime": None,
    }
    said = house["say"][0].data
    assert said["tts_platform"] == "tts.house" and said["options"] == {"voice": "eve"}
    played = house["announce"][0].data
    assert played["url"] == "https://ha.example/chime/abc.mp3"
    assert played["use_pre_announce"] is True and played["announce_volume"] == 75
    assert house["tv"][0].data["announce"] is True


async def test_speakers_by_name_and_without_the_tvs(
    hass: HomeAssistant, house, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(at(12))
    await setup(HOUSE)
    response = await say(hass, speakers=["ensuite", "Garage"], tvs=False, volume=40)
    # The Garage is unavailable
    assert response["speakers"] == ["media_player.ensuite"] and response["tvs"] == []
    assert house["tv"] == []


async def test_quiet_at_night_unless_a_person_asked(
    hass: HomeAssistant, house, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(at(23))
    await setup(HOUSE)
    assert await say(hass) == {"skipped": "quiet_hours"}
    assert house["announce"] == []
    assert (await say(hass, quiet_hours=False))["speakers"]


async def test_quiet_in_bedtime(
    hass: HomeAssistant, house, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(at(12))
    hass.states.async_set("switch.home_bedtime", "on")
    await setup({**HOUSE, "bedtime_entity": "switch.home_bedtime"})
    assert await say(hass) == {"skipped": "quiet_hours"}


async def test_the_holidays_sound_is_the_chime(
    hass: HomeAssistant, house, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(at(12, day=31, month=10))
    await setup(HOUSE)
    response = await say(hass, tvs=False)
    assert response["chime"] == "halloween-owl"
    assert house["say"][0].data["chime_path"].endswith("halloween-owl.mp3")
    # The sound is in the file: no Music Assistant chime on top
    assert house["announce"][0].data["use_pre_announce"] is False


async def test_in_the_background(
    hass: HomeAssistant, house, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(at(12))
    await setup(HOUSE)
    assert await say(hass, wait=False) == {"started": True}
    await hass.async_block_till_done()
    assert len(house["announce"]) == 1
