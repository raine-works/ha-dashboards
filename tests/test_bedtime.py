"""Bedtime's switches and the holiday sounds' mute."""

from __future__ import annotations

from datetime import datetime

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import (
    area_registry as ar,
    entity_registry as er,
    label_registry as lr,
)
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.raineworks_dashboards.const import (
    CONF_BEDTIME_ENDS,
    CONF_BEDTIME_ROOMS,
)


@pytest.fixture
def rooms(hass: HomeAssistant) -> list[str]:
    """Two rooms; the first had a bedtime toggle (an input_boolean, on)."""
    areas = ar.async_get(hass)
    suite = areas.async_create("Master Suite")
    kids = areas.async_create("Sam's Room")
    lr.async_get(hass).async_create("Bedtime")
    registry = er.async_get(hass)
    old = registry.async_get_or_create(
        "input_boolean",
        "input_boolean",
        "suite_bedtime",
        suggested_object_id="suite_bedtime",
    )
    registry.async_update_entity(old.entity_id, area_id=suite.id, labels={"bedtime"})
    hass.states.async_set(old.entity_id, "on")
    hass.states.async_set("input_boolean.home_bedtime", "off")
    hass.states.async_set(
        "input_datetime.holiday_sounds_muted_until", "2026-11-21 13:15:00"
    )
    return [suite.id, kids.id]


def state(hass: HomeAssistant, entity_id: str) -> str:
    return hass.states.get(entity_id).state


async def test_rooms_keep_their_former_toggles_name_and_state(
    hass: HomeAssistant, rooms, setup
) -> None:
    await setup({CONF_BEDTIME_ROOMS: rooms})
    # The suite's toggle was input_boolean.suite_bedtime, on
    assert state(hass, "switch.suite_bedtime") == "on"
    # Sam's room had none: named after the room
    assert state(hass, "switch.sam_s_room_bedtime") == "off"
    assert state(hass, "switch.home_bedtime") == "off"
    entry = er.async_get(hass).async_get("switch.sam_s_room_bedtime")
    assert entry.area_id == rooms[1]
    assert "bedtime" in entry.labels


async def test_rooms_and_home_stay_in_step(hass: HomeAssistant, rooms, setup) -> None:
    await setup({CONF_BEDTIME_ROOMS: rooms})

    async def call(service: str, entity_id: str) -> None:
        await hass.services.async_call(
            "switch", service, {"entity_id": entity_id}, blocking=True
        )

    # The last room to bed puts the house to bed
    await call("turn_on", "switch.sam_s_room_bedtime")
    assert state(hass, "switch.home_bedtime") == "on"
    # Any room up again: the house is up
    await call("turn_off", "switch.suite_bedtime")
    assert state(hass, "switch.home_bedtime") == "off"
    assert state(hass, "switch.sam_s_room_bedtime") == "on"
    # Home Bedtime on: every room still up goes to bed
    await call("turn_on", "switch.home_bedtime")
    assert state(hass, "switch.suite_bedtime") == "on"
    # Home Bedtime off leaves the rooms alone
    await call("turn_off", "switch.home_bedtime")
    assert state(hass, "switch.suite_bedtime") == "on"


async def test_bedtime_ends_in_the_morning(
    hass: HomeAssistant, rooms, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(
        dt_util.as_utc(
            datetime(2026, 11, 22, 8, 59, 0, tzinfo=dt_util.get_default_time_zone())
        )
    )
    await setup({CONF_BEDTIME_ROOMS: rooms, CONF_BEDTIME_ENDS: "09:00:00"})
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": "switch.home_bedtime"}, blocking=True
    )
    freezer.tick(60)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert state(hass, "switch.suite_bedtime") == "off"
    assert state(hass, "switch.sam_s_room_bedtime") == "off"
    assert state(hass, "switch.home_bedtime") == "off"


async def test_no_switches_without_rooms(hass: HomeAssistant, rooms, setup) -> None:
    await setup()
    assert hass.states.get("switch.home_bedtime") is None


async def test_the_holiday_mute_takes_its_former_value(
    hass: HomeAssistant, rooms, setup
) -> None:
    await setup()
    muted = dt_util.parse_datetime(state(hass, "datetime.holiday_sounds_muted_until"))
    local = dt_util.as_local(muted)
    assert (local.hour, local.minute) == (13, 15)
    await hass.services.async_call(
        "datetime",
        "set_value",
        {
            "entity_id": "datetime.holiday_sounds_muted_until",
            "datetime": "2026-11-21T20:00:00+00:00",
        },
        blocking=True,
    )
    assert (
        state(hass, "datetime.holiday_sounds_muted_until")
        == "2026-11-21T20:00:00+00:00"
    )


async def test_the_status_lights_follow_home_bedtime(
    hass: HomeAssistant, rooms, setup
) -> None:
    entry = await setup({CONF_BEDTIME_ROOMS: rooms})
    controller = entry.runtime_data
    controller._track()
    assert controller._bedtime == "switch.home_bedtime"
