"""Raineworks Dashboards: Preact dashboards for Home Assistant, wall panels to phones.

Serves the dashboards bundle on every page (so the cards are there without a
Lovelace resource), tells the dashboards who the household is, takes their voice
clips (any signed-in user, not only admins), and drives the wall panels'
hardware: their status lights, waking them on a doorbell ring, and reloading
them.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
import voluptuous as vol

from . import websocket_api
from .announce import async_register_announce
from .clips import async_register_clip_views, async_start_sweeping
from .const import CONF_SERVE_BUNDLE, DOMAIN
from .notify import async_register_notify
from .panels import PanelsController
from .printer import async_register_printer
from .sensor import AFFIRMATIONS
from .serve import BundleUploadView, server
from .todo import async_register_todo

type DashboardsConfigEntry = ConfigEntry[PanelsController]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# Locks' fault sensors; bedtime's switches; the holiday sounds' mute; affirmations
PLATFORMS = [
    Platform.BINARY_SENSOR,
    Platform.DATETIME,
    Platform.SENSOR,
    Platform.SWITCH,
]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the websocket commands and actions (once, whatever the entries)."""
    websocket_api.async_register(hass)

    def controllers() -> list[PanelsController]:
        return [
            entry.runtime_data
            for entry in hass.config_entries.async_loaded_entries(DOMAIN)
        ]

    async def reload_panels(call: ServiceCall) -> None:
        for controller in controllers():
            await controller.async_reload()

    async def wake_panels(call: ServiceCall) -> None:
        for controller in controllers():
            controller.async_wake()

    async def set_affirmation(call: ServiceCall) -> None:
        person = call.data["person"]
        sensor = hass.data.get(AFFIRMATIONS, {}).get(person)
        if sensor is None:
            raise ServiceValidationError(f"{person} isn't a household member")
        sensor.set(call.data["text"])

    hass.services.async_register(
        DOMAIN,
        "set_affirmation",
        set_affirmation,
        schema=vol.Schema(
            {
                vol.Required("person"): cv.entity_id,
                vol.Required("text"): vol.All(cv.string, vol.Length(min=1, max=2000)),
            }
        ),
    )
    hass.services.async_register(DOMAIN, "reload_panels", reload_panels)
    hass.services.async_register(DOMAIN, "wake_panels", wake_panels)
    # Voice clips any signed-in user can upload for announcements
    async_register_clip_views(hass)
    hass.http.register_view(BundleUploadView())
    async_register_notify(hass)
    async_register_announce(hass)
    async_register_printer(hass)
    hass.data[f"{DOMAIN}_todo"] = async_register_todo(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: DashboardsConfigEntry) -> bool:
    """Serve the bundle, unless the options say another source serves it."""
    if entry.options.get(CONF_SERVE_BUNDLE, True):
        bundles = server(hass)
        await bundles.async_start()
        entry.async_on_unload(bundles.async_stop)
    entry.async_on_unload(async_start_sweeping(hass))
    controller = PanelsController(hass, entry)
    entry.runtime_data = controller
    controller.async_start()
    entry.async_on_unload(controller.async_stop)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    # A phone's Mark done on a to-do push
    entry.async_on_unload(
        hass.bus.async_listen(
            "mobile_app_notification_action", hass.data[f"{DOMAIN}_todo"].mark_done
        )
    )
    # Bedtime's switches; the holiday sounds' mute
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: DashboardsConfigEntry) -> bool:
    """Unload the entities; async_on_unload undoes the rest."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_options_updated(
    hass: HomeAssistant, entry: DashboardsConfigEntry
) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
