"""Each lock's fault sensor: on when its last lock failed, off once it locks."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.raineworks_dashboards.binary_sensor import is_fault

FAULT = "binary_sensor.front_door_fault"


@pytest.fixture
def lock(hass: HomeAssistant) -> str:
    """A lock on a device of its own, and a house's own fault list naming it."""
    zwave = MockConfigEntry(domain="zwave_js")
    zwave.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=zwave.entry_id,
        identifiers={("zwave_js", "front")},
        name="Front Door",
    )
    entry = er.async_get(hass).async_get_or_create(
        "lock",
        "zwave_js",
        "front",
        suggested_object_id="front_door",
        device_id=device.id,
        original_name="Front Door",
        config_entry=zwave,
    )
    hass.states.async_set(entry.entity_id, "unlocked")
    hass.states.async_set("input_text.lock_faults", '["lock.front_door"]')
    return entry.entity_id


def test_what_counts_as_a_fault() -> None:
    assert is_fault("locking", "unlocked") is True
    assert is_fault("locked", "jammed") is True
    assert is_fault("unlocked", "locked") is False
    assert is_fault("unlocked", "locking") is None
    assert is_fault("locked", "unlocking") is None
    assert is_fault("unlocking", "unlocked") is None


async def test_a_failed_lock_then_a_good_one(
    hass: HomeAssistant, lock: str, setup
) -> None:
    await setup()
    # It took the house's own list's word, the lock being unlocked
    assert hass.states.get(FAULT).state == "on"
    assert hass.states.get(FAULT).attributes["device_class"] == "problem"
    hass.states.async_set(lock, "locking")
    hass.states.async_set(lock, "locked")
    await hass.async_block_till_done()
    assert hass.states.get(FAULT).state == "off"
    # The bolt hits the strike: locking, then back to unlocked at the timeout
    hass.states.async_set(lock, "locking")
    hass.states.async_set(lock, "unlocked")
    await hass.async_block_till_done()
    assert hass.states.get(FAULT).state == "on"
    # Unlocking by hand isn't a fix; locking is
    hass.states.async_set(lock, "unlocking")
    hass.states.async_set(lock, "unlocked")
    await hass.async_block_till_done()
    assert hass.states.get(FAULT).state == "on"
    hass.states.async_set(lock, "jammed")
    hass.states.async_set(lock, "locked")
    await hass.async_block_till_done()
    assert hass.states.get(FAULT).state == "off"


async def test_in_the_locks_area(hass: HomeAssistant, lock: str, setup) -> None:
    registry = er.async_get(hass)
    device_id = registry.async_get(lock).device_id
    dr.async_get(hass).async_update_device(device_id, area_id="entry")
    await setup()
    assert registry.async_get(FAULT).area_id == "entry"


async def test_a_locked_lock_has_no_fault_whatever_was_kept(
    hass: HomeAssistant, lock: str, setup
) -> None:
    hass.states.async_set(lock, "locked")
    await setup()
    assert hass.states.get(FAULT).state == "off"
