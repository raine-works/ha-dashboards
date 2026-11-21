"""When the holiday sounds are muted until (the wall panels' mute button sets it).

The holiday easter eggs play their sounds on the wall panels; a tap on the mute
beside the character mutes them on every panel for an hour. Keeps its value
through restarts; on first start takes the former input_datetime's.
"""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.datetime import DateTimeEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

OBJECT_ID = "holiday_sounds_muted_until"
FORMER = f"input_datetime.{OBJECT_ID}"


class HolidayMute(DateTimeEntity, RestoreEntity):
    """The holiday sounds' mute, a time (in the past: not muted)."""

    _attr_should_poll = False
    _attr_icon = "mdi:volume-off"
    _attr_name = "Holiday Sounds Muted Until"
    _attr_translation_key = "holiday_mute"
    _attr_unique_id = OBJECT_ID

    def __init__(self) -> None:
        self.entity_id = f"datetime.{OBJECT_ID}"
        self._attr_native_value = None

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        source = last if last is not None else self.hass.states.get(FORMER)
        if source is not None:
            parsed = dt_util.parse_datetime(source.state)
            if parsed is None and last is None:
                # input_datetime's state is local "YYYY-MM-DD HH:MM:SS"
                parsed = dt_util.parse_datetime(source.state.replace(" ", "T"))
            if parsed is not None:
                self._attr_native_value = dt_util.as_utc(
                    parsed
                    if parsed.tzinfo
                    else parsed.replace(tzinfo=dt_util.get_default_time_zone())
                )

    async def async_set_value(self, value: datetime) -> None:
        self._attr_native_value = value
        self.async_write_ha_state()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """The one mute."""
    async_add_entities([HolidayMute()])
