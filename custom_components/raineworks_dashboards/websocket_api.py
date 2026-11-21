"""What the dashboards ask the integration for."""

from __future__ import annotations

from typing import Any

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.loader import async_get_integration
import voluptuous as vol

from .const import CONF_HOUSE, CONF_HOUSEHOLD_GROUP, DOMAIN
from .household import household


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_info)
    websocket_api.async_register_command(hass, ws_config_entry)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/info"})
@websocket_api.async_response
async def ws_info(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """The integration's version and the household, for any signed-in user.

    Only the people this user may read: with Warden (or any policy) limiting
    what they see, a person they can't read isn't named to them here either.
    """
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    options = entries[0].options if entries else {}
    group = options.get(CONF_HOUSEHOLD_GROUP)
    everyone, source = household(hass, group)
    permissions = connection.user.permissions
    people = [p for p in everyone if permissions.check_entity(p, POLICY_READ)]
    integration = await async_get_integration(hass, DOMAIN)
    connection.send_result(
        msg["id"],
        {
            "version": str(integration.version),
            "household": people,
            "household_source": source,
            # The house settings, as a card's `house` option (house.yaml) writes them;
            # a card's own option wins where both set something
            "house": _without_empty(options.get(CONF_HOUSE) or {}),
            # The house theme's id (Home Assistant's default; a person's own pick wins)
            "theme": options.get("theme", "raineworks"),
        },
    )


def _without_empty(value: Any) -> Any:
    """The settings without unset values, so an empty field never hides a card's."""
    if isinstance(value, dict):
        kept = {k: _without_empty(v) for k, v in value.items()}
        return {k: v for k, v in kept.items() if v not in (None, "", [], {})}
    return value


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/config_entry",
        vol.Required("entity_id"): str,
    }
)
@callback
def ws_config_entry(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """An entity's config entry id, for any user who may read the entity.

    Music Assistant's actions take their config entry; Home Assistant's own
    lookups (config/entity_registry/get) are for admins, which made every wall
    panel's shared user one.
    """
    entity_id = msg["entity_id"]
    if not connection.user.permissions.check_entity(entity_id, POLICY_READ):
        connection.send_error(msg["id"], "unauthorized", "Not allowed to read it")
        return
    entry = er.async_get(hass).async_get(entity_id)
    connection.send_result(
        msg["id"], {"config_entry_id": entry.config_entry_id if entry else None}
    )
