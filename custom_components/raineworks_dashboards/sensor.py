"""Each household member's daily affirmation: when it was written, and its words.

Written by the `raineworks_dashboards.set_affirmation` action (the house's morning
automation, a camera greeting); the dashboards' Daily dialog shows it. The text
is an attribute, so it isn't cut to a state's 255 characters. Kept through
restarts; on first start a member's takes their former input_text's
(`input_text.daily_affirmation_<person>`, JSON `{"at": <epoch s>, "text": ...}`).
"""

from __future__ import annotations

from datetime import datetime
import json

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from .const import CONF_HOUSEHOLD_GROUP, DOMAIN
from .household import household

AFFIRMATIONS = f"{DOMAIN}_affirmations"


def former_affirmation(hass: HomeAssistant, person: str) -> tuple[datetime, str] | None:
    """A member's affirmation from their former input_text, if it held one."""
    state = hass.states.get(f"input_text.daily_affirmation_{person.split('.', 1)[1]}")
    try:
        value = json.loads(state.state) if state else None
    except ValueError:
        return None
    if not isinstance(value, dict):
        return None
    at, text = value.get("at"), value.get("text")
    if (
        not isinstance(at, (int, float))
        or not isinstance(text, str)
        or not text.strip()
    ):
        return None
    return dt_util.utc_from_timestamp(at), text.strip()


class Affirmation(SensorEntity, RestoreEntity):
    """A household member's latest affirmation."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_should_poll = False
    _attr_icon = "mdi:heart-outline"
    _attr_translation_key = "affirmation"

    def __init__(self, person: str, name: str) -> None:
        self.person = person
        self._attr_unique_id = f"affirmation_{person}"
        self._attr_name = f"{name} daily affirmation"
        self.entity_id = f"sensor.daily_affirmation_{person.split('.', 1)[1]}"
        self._attr_native_value = None
        self._text: str | None = None

    @property
    def extra_state_attributes(self) -> dict[str, str | None]:
        return {"person": self.person, "text": self._text}

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.hass.data.setdefault(AFFIRMATIONS, {})[self.person] = self
        self.async_on_remove(
            lambda: self.hass.data[AFFIRMATIONS].pop(self.person, None)
        )
        last = await self.async_get_last_state()
        if last is not None and (at := dt_util.parse_datetime(last.state)):
            self._attr_native_value = at
            self._text = last.attributes.get("text")
        elif former := former_affirmation(self.hass, self.person):
            self._attr_native_value, self._text = former

    @callback
    def set(self, text: str, at: datetime | None = None) -> None:
        self._attr_native_value = at or dt_util.utcnow()
        self._text = text.strip()
        self.async_write_ha_state()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """One per household member (the household as the dashboards have it)."""
    people, _ = household(hass, entry.options.get(CONF_HOUSEHOLD_GROUP))
    async_add_entities(
        Affirmation(person, (s.name if (s := hass.states.get(person)) else person))
        for person in people
    )
