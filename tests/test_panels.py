"""The wall panels' hardware: status lights, waking on a ring, reloading."""

from __future__ import annotations

import asyncio
from types import MappingProxyType

from homeassistant.config_entries import ConfigSubentry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import (
    device_registry as dr,
    entity_registry as er,
    label_registry as lr,
)
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_mock_service,
)

from custom_components.raineworks_dashboards import panels as panels_module
from custom_components.raineworks_dashboards.const import (
    CONF_BEDTIME_ENTITY,
    DOMAIN,
    SUBENTRY_WALL_PANEL,
)

DOOR = "binary_sensor.front_door"
LED = "light.kitchen_panel_led"
WAKE = "button.kitchen_panel_wake_screen"
RELOAD = "button.kitchen_panel_reload"
DOORBELL = "event.porch_doorbell"
ALARM = "alarm_control_panel.house"


@pytest.fixture
def house(hass: HomeAssistant) -> str:
    """A ROAMiQ-like panel, a door labeled Exterior Door, a doorbell, an alarm."""
    hardware = MockConfigEntry(domain="mqtt")
    hardware.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=hardware.entry_id, identifiers={("mqtt", "kitchen_panel")}
    )
    registry = er.async_get(hass)
    for entity_id, name, device_class in (
        (LED, "LED", None),
        (WAKE, "Wake Screen", None),
        (RELOAD, "Reload", "restart"),
    ):
        domain, object_id = entity_id.split(".")
        registry.async_get_or_create(
            domain,
            "mqtt",
            object_id,
            suggested_object_id=object_id,
            device_id=device.id,
            original_name=name,
            original_device_class=device_class,
            config_entry=hardware,
        )
    lr.async_get(hass).async_create("Exterior Door")
    door = registry.async_get_or_create(
        "binary_sensor", "zha", "front", suggested_object_id="front_door"
    )
    registry.async_update_entity(door.entity_id, labels={"exterior_door"})
    registry.async_get_or_create(
        "event",
        "unifiprotect",
        "ring",
        suggested_object_id="porch_doorbell",
        original_device_class="doorbell",
    )
    hass.states.async_set(DOOR, "off")
    hass.states.async_set(ALARM, "disarmed")
    hass.states.async_set(DOORBELL, "2026-11-21T10:00:00", {"event_type": "ring"})
    hass.states.async_set("input_boolean.bedtime", "off")
    return device.id


@pytest.fixture
async def panel(hass: HomeAssistant, house: str):
    """The integration with the kitchen panel registered by its device alone."""
    calls = {
        "on": async_mock_service(hass, "light", "turn_on"),
        "off": async_mock_service(hass, "light", "turn_off"),
        "press": async_mock_service(hass, "button", "press"),
    }
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={CONF_BEDTIME_ENTITY: "input_boolean.bedtime"},
        subentries_data=[
            {
                "data": {"device_id": house},
                "subentry_type": SUBENTRY_WALL_PANEL,
                "title": "Kitchen wall panel",
                "unique_id": None,
            }
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, calls


def last(calls) -> dict:
    return dict(calls[-1].data)


async def test_finds_the_hardware_on_the_device(hass: HomeAssistant, panel) -> None:
    entry, _ = panel
    (found,) = entry.runtime_data.panels
    assert found.name == "Kitchen wall panel"
    assert (
        found.hardware.status_light,
        found.hardware.wake,
        found.hardware.reload,
    ) == (
        LED,
        WAKE,
        RELOAD,
    )


async def test_an_open_exterior_door_shows_amber(hass: HomeAssistant, panel) -> None:
    _, calls = panel
    # Started with the house as it is: nothing to show
    assert last(calls["off"])["entity_id"] == LED
    hass.states.async_set(DOOR, "on")
    await hass.async_block_till_done()
    assert last(calls["on"]) == {
        "entity_id": LED,
        "rgb_color": [255, 140, 0],
        "brightness": 255,
        "transition": 1,
    }
    # Dimmed in bedtime
    hass.states.async_set("input_boolean.bedtime", "on")
    await hass.async_block_till_done()
    assert last(calls["on"])["brightness"] == 26
    hass.states.async_set(DOOR, "off")
    await hass.async_block_till_done()
    assert len(calls["off"]) == 2


async def test_a_triggered_alarm_pulses_red_until_it_stops(
    hass: HomeAssistant, panel, monkeypatch
) -> None:
    _, calls = panel
    monkeypatch.setattr(panels_module, "PULSE_HALF_S", 0.01)
    hass.states.async_set(ALARM, "triggered")
    await hass.async_block_till_done(wait_background_tasks=False)
    await asyncio.sleep(0.05)
    pulses = [
        c.data["brightness"] for c in calls["on"] if c.data["rgb_color"] == [255, 0, 0]
    ]
    assert pulses[:2] == [255, 25]
    assert len(pulses) >= 3

    hass.states.async_set(ALARM, "armed_away")
    await hass.async_block_till_done(wait_background_tasks=False)
    await asyncio.sleep(0.05)
    assert last(calls["on"])["rgb_color"] == [0, 255, 0]
    count = len(calls["on"])
    await asyncio.sleep(0.05)
    # The pulse stopped
    assert len(calls["on"]) == count


async def test_a_ring_wakes_the_panels(hass: HomeAssistant, panel) -> None:
    _, calls = panel
    hass.states.async_set(DOORBELL, "2026-11-21T10:05:00", {"event_type": "ring"})
    await hass.async_block_till_done()
    assert [c.data["entity_id"] for c in calls["press"]] == [WAKE]
    # The doorbell coming back after it was unavailable isn't a ring
    hass.states.async_set(DOORBELL, "unavailable")
    hass.states.async_set(DOORBELL, "2026-11-21T10:05:00", {"event_type": "ring"})
    await hass.async_block_till_done()
    assert len(calls["press"]) == 1


async def test_the_reload_action(hass: HomeAssistant, panel) -> None:
    _, calls = panel
    await hass.services.async_call(DOMAIN, "reload_panels", blocking=True)
    assert [c.data["entity_id"] for c in calls["press"]] == [RELOAD]


async def test_nothing_without_panels(hass: HomeAssistant, house: str) -> None:
    on = async_mock_service(hass, "light", "turn_on")
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    hass.states.async_set(DOOR, "on")
    await hass.async_block_till_done()
    assert on == []


async def test_a_panels_own_picks_win(hass: HomeAssistant, house: str) -> None:
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    hass.config_entries.async_add_subentry(
        entry,
        ConfigSubentry(
            data=MappingProxyType({"device_id": house, "status_light": "light.strip"}),
            subentry_type=SUBENTRY_WALL_PANEL,
            title="Hall",
            unique_id=None,
        ),
    )
    (found,) = panels_module.wall_panels(hass, entry)
    assert found.hardware.status_light == "light.strip"
    assert found.hardware.wake == WAKE


async def test_adding_a_panel_in_the_ui(hass: HomeAssistant, house: str) -> None:
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    flows = hass.config_entries.subentries
    result = await flows.async_init(
        (entry.entry_id, SUBENTRY_WALL_PANEL), context={"source": "user"}
    )
    result = await flows.async_configure(
        result["flow_id"], {"name": " Kitchen wall panel ", "device_id": house}
    )
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    (subentry,) = entry.subentries.values()
    assert subentry.title == "Kitchen wall panel"
    # The entry reloaded with it: the panel is driven
    (found,) = entry.runtime_data.panels
    assert found.hardware.status_light == LED
