"""Pushes to household members' phones: `raineworks_dashboards.notify_people`.

Each person's phones are their device trackers' devices, each a Companion app
with a `notify.mobile_app_<device>` action. No people = the whole household (the
integration's: a Warden group's members, else everyone with a device tracker).
One phone that's gone (a removed app) never stops the others. A push can name
its category (`push.py`): people who turned that category off are skipped,
except for Security, which always comes through.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.helpers import (
    config_validation as cv,
    device_registry as dr,
    entity_registry as er,
)
from homeassistant.util import slugify
import voluptuous as vol

from .const import CONF_HOUSEHOLD_GROUP, DOMAIN
from .household import household
from .push import CATEGORY_IDS, async_preferences

_LOGGER = logging.getLogger(__name__)

NOTIFY_ACTION = "notify_people"

NOTIFY_SCHEMA = vol.Schema(
    {
        vol.Optional("people", default=[]): vol.Any(cv.entity_ids, None),
        vol.Optional("exclude", default=[]): vol.Any(cv.entity_ids, None),
        vol.Required("title"): cv.string,
        vol.Required("message"): cv.string,
        vol.Optional("data", default={}): vol.Any(dict, None),
        # The push's kind (push.CATEGORIES), for each person's own choices
        vol.Optional("category"): vol.Any(cv.string, None),
    }
)


def phone_actions(hass: HomeAssistant, people: list[str]) -> list[str]:
    """The notify actions (`mobile_app_<device>`) of these people's phones."""
    entities = er.async_get(hass)
    devices = dr.async_get(hass)
    actions: list[str] = []
    for person in people:
        state = hass.states.get(person)
        trackers = state.attributes.get("device_trackers") if state else None
        for tracker in trackers or []:
            entry = entities.async_get(tracker)
            device = (
                devices.async_get(entry.device_id)
                if entry and entry.device_id
                else None
            )
            if device is None or not device.name:
                continue
            action = f"mobile_app_{slugify(device.name)}"
            if action not in actions and hass.services.has_service("notify", action):
                actions.append(action)
    return actions


def household_of(hass: HomeAssistant) -> list[str]:
    """The household's person entity ids, from the integration's household group.

    The group is the first loaded config entry's household group option; with no
    entry, or no group (or one that's gone), the household is every person with a
    device tracker, as `household()` decides.
    """
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    group = entries[0].options.get(CONF_HOUSEHOLD_GROUP) if entries else None
    return household(hass, group)[0]


@callback
def async_register_notify(hass: HomeAssistant) -> None:
    """The notify_people action."""

    async def notify_people(call: ServiceCall) -> dict[str, Any]:
        people = list(call.data.get("people") or []) or household_of(hass)
        exclude = set(call.data.get("exclude") or [])
        preferences = await async_preferences(hass)
        category = call.data.get("category")
        if category and category not in CATEGORY_IDS:
            # Sent to everyone named, as a push without a category is
            _LOGGER.warning(
                "Unknown push category %s: sending it to everyone", category
            )
        named = [p for p in people if p not in exclude]
        wanted = [p for p in named if preferences.wants(p, category)]
        actions = phone_actions(hass, wanted)
        payload = {
            "title": call.data["title"],
            "message": call.data["message"],
            "data": call.data.get("data") or {},
        }

        async def send(action: str) -> bool:
            try:
                await hass.services.async_call("notify", action, payload, blocking=True)
            except Exception:  # A phone that's gone: the others still get it
                _LOGGER.warning("Couldn't notify %s", action, exc_info=True)
                return False
            return True

        sent = await asyncio.gather(*(send(a) for a in actions))
        return {
            "sent": [a for a, ok in zip(actions, sent, strict=True) if ok],
            # Who turned this category off
            "skipped": [p for p in named if p not in wanted],
        }

    hass.services.async_register(
        DOMAIN,
        NOTIFY_ACTION,
        notify_people,
        schema=NOTIFY_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
