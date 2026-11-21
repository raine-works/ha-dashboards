"""A fault sensor per lock: on when its last lock failed, off once it locks.

Many smart locks never report `jammed` when the bolt hits the strike of a door
that isn't shut all the way: Home Assistant shows them `locking` until its
timeout, then `unlocked` again. That transition, or `jammed`, is the fault; the
dashboards' lock buttons show the lock as Jammed meanwhile, and an automation
can notify on it. In the lock's area (a device belongs to one integration, so not
on the lock's own device), kept through restarts.
"""

from __future__ import annotations

import json

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.restore_state import RestoreEntity

# A house's own list from before (a UI input_text holding a JSON list of lock ids)
FORMER_FAULTS = "input_text.lock_faults"


def is_fault(old: str | None, new: str) -> bool | None:
    """True when a change shows a failed lock, False when it shows a lock, else None."""
    if new == "jammed" or (old == "locking" and new == "unlocked"):
        return True
    if new == "locked":
        return False
    return None


def former_faults(hass: HomeAssistant) -> set[str]:
    """The locks the house's own list had as faulty."""
    state = hass.states.get(FORMER_FAULTS)
    try:
        faults = json.loads(state.state) if state else []
    except ValueError:
        return set()
    return {str(f) for f in faults} if isinstance(faults, list) else set()


class LockFault(BinarySensorEntity, RestoreEntity):
    """Whether a lock's last lock failed."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_should_poll = False
    _attr_translation_key = "lock_fault"

    def __init__(self, lock: er.RegistryEntry, name: str, area_id: str | None) -> None:
        self.lock = lock.entity_id
        self._area_id = area_id
        self._attr_unique_id = f"lock_fault_{lock.id}"
        self._attr_name = f"{name} fault"
        self.entity_id = f"binary_sensor.{lock.entity_id.split('.', 1)[1]}_fault"
        self._attr_is_on = False

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self._attr_is_on = last.state == "on"
        else:
            self._attr_is_on = self.lock in former_faults(self.hass)
        # A lock that's locked now has no fault, whatever was kept
        if (state := self.hass.states.get(self.lock)) and state.state == "locked":
            self._attr_is_on = False
        self.async_on_remove(
            async_track_state_change_event(self.hass, [self.lock], self._changed)
        )
        registry = er.async_get(self.hass)
        entry = registry.async_get(self.entity_id)
        if entry is not None and entry.area_id is None and self._area_id:
            registry.async_update_entity(self.entity_id, area_id=self._area_id)

    @callback
    def _changed(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        if new is None:
            return
        fault = is_fault(old.state if old else None, new.state)
        if fault is not None and fault != self._attr_is_on:
            self._attr_is_on = fault
            self.async_write_ha_state()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """A fault sensor for every lock (a new lock gets one on the next reload)."""
    entities = er.async_get(hass)
    devices = dr.async_get(hass)
    faults = []
    for lock in entities.entities.values():
        if lock.domain != "lock" or lock.disabled or lock.platform == "group":
            continue
        state = hass.states.get(lock.entity_id)
        name = (
            lock.name
            or (state.name if state else None)
            or lock.original_name
            or lock.entity_id
        )
        device = devices.async_get(lock.device_id) if lock.device_id else None
        area_id = lock.area_id or (device.area_id if device else None)
        faults.append(LockFault(lock, name, area_id))
    async_add_entities(faults)
