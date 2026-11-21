"""The dashboards' themes, as Home Assistant themes.

The preset themes (themes.json, written from the dashboards' own themes by
`bun scripts/themes.ts`) and the custom themes people make in the dashboards
are registered in Home Assistant's theme list at runtime, so they style its
whole UI (and the Companion apps' bars) like any theme, and show in
Profile → Theme. Home Assistant has no API for this: themes live in
`hass.data[frontend.DATA_THEMES]`, which `frontend.reload_themes` replaces
with the YAML ones (every deploy that reloads themes), so they're added again
whenever `themes_updated` fires without them.

The house theme (the options' Theme) is Home Assistant's default theme for
anyone who hasn't picked one; Home Assistant forgets a default theme that no
YAML defines at each start, so it's set again once ours are registered.

Custom themes are each person's own, or the house's (an administrator's,
shared): a theme's tokens (what the dashboards draw with) and its Home
Assistant theme, both made in the dashboards' theme editor.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import uuid

from homeassistant.components import websocket_api
from homeassistant.components.frontend import DATA_THEMES
from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.const import EVENT_THEMES_UPDATED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.storage import Store
import voluptuous as vol

from .const import DOMAIN

PRESETS_FILE = Path(__file__).parent / "themes.json"
CONF_THEME = "theme"
DEFAULT_THEME = "raineworks"
# Home Assistant's own default theme, and "leave Home Assistant's theme alone"
HA_DEFAULT = "default"
KEEP_HA_THEME = ""
DATA_DEFAULT_THEME = "frontend_default_theme"
DATA_DEFAULT_DARK_THEME = "frontend_default_dark_theme"
STORAGE_KEY = f"{DOMAIN}.themes"
MAX_CUSTOM = 50
MAX_THEME_BYTES = 64 * 1024


def load_presets() -> dict[str, Any]:
    """themes.json: {default, themes: [{id, name, ha_name, description, theme}]}.

    Run in the executor.
    """
    return json.loads(PRESETS_FILE.read_text())


def valid_ha_theme(theme: Any) -> bool:
    """A Home Assistant theme: string values, and modes of string values."""
    if not isinstance(theme, dict):
        return False
    for key, value in theme.items():
        if key == "modes":
            if not isinstance(value, dict) or not set(value) <= {"light", "dark"}:
                return False
            if not all(
                isinstance(mode, dict)
                and all(
                    isinstance(k, str) and isinstance(v, str) for k, v in mode.items()
                )
                for mode in value.values()
            ):
                return False
        elif not isinstance(key, str) or not isinstance(value, str):
            return False
    return True


class Themes:
    """The registered themes: the presets, then the custom ones."""

    def __init__(self, hass: HomeAssistant, presets: dict[str, Any]) -> None:
        self.hass = hass
        self.presets: list[dict[str, Any]] = presets["themes"]
        self.custom: list[dict[str, Any]] = []
        self._store: Store[dict[str, Any]] = Store(hass, 1, STORAGE_KEY)

    async def async_load(self) -> None:
        """The custom themes people saved."""
        data = await self._store.async_load() or {}
        self.custom = [t for t in data.get("custom", []) if isinstance(t, dict)]

    def _save(self) -> None:
        self._store.async_delay_save(lambda: {"custom": self.custom}, 1)

    def ha_themes(self) -> dict[str, dict[str, Any]]:
        """Every theme by its name in Home Assistant."""
        themes = {t["ha_name"]: t["theme"] for t in self.presets}
        themes.update({t["ha_name"]: t["ha"] for t in self.custom})
        return themes

    def ha_name(self, theme_id: str) -> str | None:
        """A theme's name in Home Assistant, by its id."""
        for theme in [*self.presets, *self.custom]:
            if theme["id"] == theme_id:
                return theme["ha_name"]
        return None

    @callback
    def async_register(self) -> bool:
        """Put every theme in Home Assistant's list; True when something was added."""
        registered = self.hass.data.setdefault(DATA_THEMES, {})
        changed = False
        for name, theme in self.ha_themes().items():
            if registered.get(name) is not theme:
                registered[name] = theme
                changed = True
        if changed:
            self.hass.bus.async_fire(EVENT_THEMES_UPDATED)
        return changed

    @callback
    def async_unregister(self, names: list[str]) -> None:
        registered = self.hass.data.get(DATA_THEMES, {})
        for name in names:
            registered.pop(name, None)
        self.hass.bus.async_fire(EVENT_THEMES_UPDATED)

    @callback
    def async_listen(self) -> Any:
        """Register the themes again after frontend.reload_themes drops them."""

        @callback
        def _updated(_event: Event) -> None:
            registered = self.hass.data.get(DATA_THEMES, {})
            if any(name not in registered for name in self.ha_themes()):
                self.async_register()

        return self.hass.bus.async_listen(EVENT_THEMES_UPDATED, _updated)

    async def async_set_house_theme(self, theme_id: str) -> None:
        """Make it Home Assistant's default theme, light and dark (unless told not)."""
        if theme_id == KEEP_HA_THEME:
            return
        name = self.ha_name(theme_id) or self.ha_name(DEFAULT_THEME)
        if name is None:
            return
        if self.hass.data.get(DATA_DEFAULT_THEME) == name and self.hass.data.get(
            DATA_DEFAULT_DARK_THEME
        ) in (None, name):
            return
        await self.hass.services.async_call(
            "frontend", "set_theme", {"name": name, "name_dark": name}, blocking=True
        )

    # Custom themes ----------------------------------------------------------------

    def visible_to(self, user_id: str) -> list[dict[str, Any]]:
        """The house's custom themes and this person's own."""
        return [t for t in self.custom if t.get("owner") in (None, user_id)]

    def save(
        self,
        user_id: str,
        is_admin: bool,
        theme: dict[str, Any],
        ha: dict[str, Any],
        shared: bool,
    ) -> dict[str, Any]:
        """Add or replace a custom theme; the saved entry."""
        if shared and not is_admin:
            raise PermissionError(
                "Only an administrator can share a theme with the house"
            )
        name = str(theme.get("name") or "").strip()[:40]
        if not name:
            raise ValueError("A theme needs a name")
        if not valid_ha_theme(ha) or len(json.dumps([theme, ha])) > MAX_THEME_BYTES:
            raise ValueError("Not a theme")
        theme_id = str(theme.get("id") or "")
        existing = next((t for t in self.custom if t["id"] == theme_id), None)
        if existing and existing.get("owner") not in (
            user_id,
            None if is_admin else user_id,
        ):
            raise PermissionError("Not your theme")
        if not existing:
            if len(self.custom) >= MAX_CUSTOM:
                raise ValueError("Too many custom themes")
            theme_id = f"custom-{uuid.uuid4().hex[:10]}"
        taken = {*self.ha_themes(), *self.hass.data.get(DATA_THEMES, {})}
        if existing:
            taken.discard(existing["ha_name"])
        ha_name = name
        suffix = 2
        while ha_name in taken:
            ha_name = f"{name} {suffix}"
            suffix += 1
        entry = {
            "id": theme_id,
            "name": name,
            "ha_name": ha_name,
            "owner": None if shared else user_id,
            "tokens": {**theme, "id": theme_id, "name": name},
            "ha": ha,
        }
        if existing:
            self.custom[self.custom.index(existing)] = entry
            if existing["ha_name"] != ha_name:
                self.hass.data.get(DATA_THEMES, {}).pop(existing["ha_name"], None)
        else:
            self.custom.append(entry)
        self._save()
        self.async_register()
        return entry

    def delete(self, user_id: str, is_admin: bool, theme_id: str) -> None:
        """Remove a custom theme (its owner's, or any for an administrator)."""
        entry = next((t for t in self.custom if t["id"] == theme_id), None)
        if entry is None:
            raise ValueError("No such theme")
        if entry.get("owner") != user_id and not is_admin:
            raise PermissionError("Not your theme")
        self.custom.remove(entry)
        self._save()
        self.async_unregister([entry["ha_name"]])


def _themes(hass: HomeAssistant) -> Themes | None:
    return hass.data.get(f"{DOMAIN}_themes")


def _describe(theme: dict[str, Any], user_id: str) -> dict[str, Any]:
    custom = "tokens" in theme
    return {
        "id": theme["id"],
        "name": theme["name"],
        "ha_name": theme["ha_name"],
        "description": theme.get("description", ""),
        "custom": custom,
        "mine": custom and theme.get("owner") == user_id,
        "shared": custom and theme.get("owner") is None,
        **({"tokens": theme["tokens"]} if custom else {}),
    }


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/themes"})
@callback
def ws_themes(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """The themes this person can pick: the presets, the house's and their own."""
    themes = _themes(hass)
    if themes is None:
        connection.send_error(
            msg["id"], "not_loaded", "Raineworks Dashboards isn't set up"
        )
        return
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    house = (
        entries[0].options.get(CONF_THEME, DEFAULT_THEME) if entries else DEFAULT_THEME
    )
    user_id = connection.user.id
    connection.send_result(
        msg["id"],
        {
            "house": house,
            "themes": [
                _describe(t, user_id)
                for t in [*themes.presets, *themes.visible_to(user_id)]
            ],
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/themes/save",
        vol.Required("theme"): dict,
        vol.Required("ha"): dict,
        vol.Optional("shared", default=False): bool,
    }
)
@callback
def ws_save_theme(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Save a custom theme (an administrator's can be the house's)."""
    themes = _themes(hass)
    if themes is None:
        connection.send_error(
            msg["id"], "not_loaded", "Raineworks Dashboards isn't set up"
        )
        return
    try:
        entry = themes.save(
            connection.user.id,
            connection.user.is_admin,
            msg["theme"],
            msg["ha"],
            msg["shared"],
        )
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], _describe(entry, connection.user.id))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/themes/delete", vol.Required("theme_id"): str}
)
@callback
def ws_delete_theme(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Delete a custom theme."""
    themes = _themes(hass)
    if themes is None:
        connection.send_error(
            msg["id"], "not_loaded", "Raineworks Dashboards isn't set up"
        )
        return
    try:
        themes.delete(connection.user.id, connection.user.is_admin, msg["theme_id"])
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"])


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """The theme commands (once)."""
    websocket_api.async_register_command(hass, ws_themes)
    websocket_api.async_register_command(hass, ws_save_theme)
    websocket_api.async_register_command(hass, ws_delete_theme)


async def async_setup_themes(hass: HomeAssistant, theme_id: str) -> Themes:
    """Register the themes and make the house theme Home Assistant's default."""
    key = f"{DOMAIN}_themes"
    themes: Themes | None = hass.data.get(key)
    if themes is None:
        themes = Themes(hass, await hass.async_add_executor_job(load_presets))
        await themes.async_load()
        hass.data[key] = themes
    themes.async_register()
    await themes.async_set_house_theme(theme_id)
    return themes
