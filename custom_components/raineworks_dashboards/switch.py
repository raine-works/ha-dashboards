"""Bedtime: a switch per room and Home Bedtime, kept in step.

Every room on turns Home Bedtime on; any room off turns it off; Home Bedtime
turned on turns on every room still off (turned off, it leaves the rooms: a room
where someone sleeps stays on). At the options' end time every room turns off.
What a room's bedtime *does* is the house's own automations, triggered by these.

Each room's switch carries the `bedtime` label and its area, which is how the
dashboards (and automations, with label_entities) find them. A room that already
had a bedtime toggle (an input_boolean with the label, in that area) gives its
switch its name and its state, so moving to these keeps the entity's name but
for its domain.
"""

from __future__ import annotations

from datetime import time
from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    entity_registry as er,
    label_registry as lr,
)
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import slugify

from .const import (
    BEDTIME_LABEL,
    CONF_BEDTIME_ENDS,
    CONF_BEDTIME_ROOMS,
    DEFAULT_BEDTIME_ENDS,
)

HOME_OBJECT_ID = "home_bedtime"


def former_toggle(hass: HomeAssistant, area_id: str) -> str | None:
    """A room's bedtime toggle from before (an input_boolean labeled bedtime, in it)."""
    for entry in er.async_get(hass).entities.values():
        if (
            entry.domain == "input_boolean"
            and entry.area_id == area_id
            and BEDTIME_LABEL in entry.labels
        ):
            return entry.entity_id
    return None


def parse_time(value: str | None) -> time:
    """The end time from the options ("09:00:00"), else 9 AM."""
    try:
        return time.fromisoformat(value or DEFAULT_BEDTIME_ENDS)
    except ValueError:
        return time.fromisoformat(DEFAULT_BEDTIME_ENDS)


class Bedtime:
    """The rooms and Home Bedtime, kept in step."""

    def __init__(self) -> None:
        self.rooms: list[RoomBedtime] = []
        self.home: HomeBedtime | None = None

    @callback
    def room_changed(self, on: bool) -> None:
        if self.home is None:
            return
        if on and not self.home.is_on and all(r.is_on for r in self.rooms):
            self.home.set_on(True, sync=False)
        elif not on and self.home.is_on:
            self.home.set_on(False, sync=False)

    @callback
    def home_turned_on(self) -> None:
        for room in self.rooms:
            if not room.is_on:
                room.set_on(True, sync=False)

    @callback
    def end(self, _now: Any = None) -> None:
        """Morning: every room off (and so Home Bedtime)."""
        for room in self.rooms:
            if room.is_on:
                room.set_on(False)


class _BedtimeSwitch(SwitchEntity, RestoreEntity):
    """A bedtime switch that keeps its state, first taking its former one's."""

    _attr_should_poll = False

    def __init__(self, bedtime: Bedtime, former: str | None) -> None:
        self.bedtime = bedtime
        self._former = former
        self._attr_is_on = False

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self._attr_is_on = last.state == "on"
        elif self._former and (state := self.hass.states.get(self._former)):
            self._attr_is_on = state.state == "on"

    @callback
    def set_on(self, on: bool, sync: bool = True) -> None:
        if self._attr_is_on == on:
            return
        self._attr_is_on = on
        self.async_write_ha_state()
        if sync:
            self._synced(on)

    def _synced(self, on: bool) -> None:
        raise NotImplementedError

    async def async_turn_on(self, **kwargs: Any) -> None:
        self.set_on(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self.set_on(False)


class RoomBedtime(_BedtimeSwitch):
    """A room's bedtime, in its area, with the bedtime label."""

    _attr_icon = "mdi:weather-night"
    _attr_translation_key = "room_bedtime"

    def __init__(
        self, bedtime: Bedtime, area: ar.AreaEntry, former: str | None
    ) -> None:
        super().__init__(bedtime, former)
        self.area_id = area.id
        self._attr_name = f"{area.name} Bedtime"
        self._attr_unique_id = f"bedtime_{area.id}"
        object_id = (
            former.split(".", 1)[1] if former else f"{slugify(area.name)}_bedtime"
        )
        self.entity_id = f"switch.{object_id}"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        labels = lr.async_get(self.hass)
        if labels.async_get_label(BEDTIME_LABEL) is None:
            labels.async_create("Bedtime", icon="mdi:weather-night")
        registry = er.async_get(self.hass)
        if (entry := registry.async_get(self.entity_id)) is not None:
            registry.async_update_entity(
                self.entity_id,
                labels={*entry.labels, BEDTIME_LABEL},
                area_id=entry.area_id or self.area_id,
            )

    def _synced(self, on: bool) -> None:
        self.bedtime.room_changed(on)


class HomeBedtime(_BedtimeSwitch):
    """The whole house's bedtime."""

    _attr_icon = "mdi:power-sleep"
    _attr_translation_key = "home_bedtime"
    _attr_name = "Home Bedtime"
    _attr_unique_id = HOME_OBJECT_ID

    def __init__(self, bedtime: Bedtime, former: str | None) -> None:
        super().__init__(bedtime, former)
        self.entity_id = f"switch.{HOME_OBJECT_ID}"

    def _synced(self, on: bool) -> None:
        if on:
            self.bedtime.home_turned_on()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """A switch per bedtime room in the options, and Home Bedtime with them."""
    areas = ar.async_get(hass)
    rooms = [
        area
        for area_id in entry.options.get(CONF_BEDTIME_ROOMS) or []
        if (area := areas.async_get_area(area_id))
    ]
    if not rooms:
        return
    bedtime = Bedtime()
    bedtime.rooms = [RoomBedtime(bedtime, a, former_toggle(hass, a.id)) for a in rooms]
    former_home = f"input_boolean.{HOME_OBJECT_ID}"
    bedtime.home = HomeBedtime(
        bedtime, former_home if hass.states.get(former_home) else None
    )
    async_add_entities([*bedtime.rooms, bedtime.home])

    ends = parse_time(entry.options.get(CONF_BEDTIME_ENDS))
    entry.async_on_unload(
        async_track_time_change(
            hass, bedtime.end, hour=ends.hour, minute=ends.minute, second=ends.second
        )
    )
