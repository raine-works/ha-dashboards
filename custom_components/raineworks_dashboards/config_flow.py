"""Config and options flow for Raineworks Dashboards."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    OptionsFlow,
    SubentryFlowResult,
)
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    AreaSelector,
    AreaSelectorConfig,
    BooleanSelector,
    DeviceSelector,
    DeviceSelectorConfig,
    EntitySelector,
    EntitySelectorConfig,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TimeSelector,
)
import voluptuous as vol

from .const import (
    CONF_ALARM_PANEL,
    CONF_BEDTIME_ENDS,
    CONF_BEDTIME_ENTITY,
    CONF_BEDTIME_ROOMS,
    CONF_DEVICE,
    CONF_HOUSE,
    CONF_HOUSEHOLD_GROUP,
    CONF_RELOAD,
    CONF_SERVE_BUNDLE,
    CONF_STATUS_LIGHT,
    CONF_WAKE,
    DEFAULT_BEDTIME_ENDS,
    DOMAIN,
    SUBENTRY_WALL_PANEL,
)
from .household import warden_groups

# The household option's "no group" choice: every person with a device tracker
TRACKERS = "__trackers__"


class DashboardsConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add the dashboards. Everything else is in the options."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm setup."""
        if user_input is not None:
            return self.async_create_entry(title="Raineworks Dashboards", data={})
        return self.async_show_form(step_id="user")

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        """Wall panels, each with its hardware."""
        return {SUBENTRY_WALL_PANEL: WallPanelSubentryFlow}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """The options: where the bundle comes from, and who the household is."""
        return DashboardsOptionsFlow()


class DashboardsOptionsFlow(OptionsFlow):
    """General (the bundle, the household, what the status lights follow), the house
    (what discovery can't tell), and the laundry."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Which part to change."""
        return self.async_show_menu(
            step_id="init", menu_options=["general", "house", "bedtime", "laundry"]
        )

    def _save(self, changes: dict[str, Any]) -> ConfigFlowResult:
        return self.async_create_entry(data={**self.config_entry.options, **changes})

    def _house(self) -> dict[str, Any]:
        return dict(self.config_entry.options.get(CONF_HOUSE) or {})

    async def async_step_general(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Serving the bundle, the household, what the status lights follow."""
        options = self.config_entry.options
        if user_input is not None:
            group = user_input.get(CONF_HOUSEHOLD_GROUP, TRACKERS)
            return self._save(
                {
                    CONF_SERVE_BUNDLE: user_input[CONF_SERVE_BUNDLE],
                    CONF_HOUSEHOLD_GROUP: None if group == TRACKERS else group,
                    CONF_ALARM_PANEL: user_input.get(CONF_ALARM_PANEL),
                    CONF_BEDTIME_ENTITY: user_input.get(CONF_BEDTIME_ENTITY),
                }
            )

        schema: dict[Any, Any] = {
            vol.Required(
                CONF_SERVE_BUNDLE, default=options.get(CONF_SERVE_BUNDLE, True)
            ): BooleanSelector(),
        }
        groups = warden_groups(self.hass)
        if groups is not None:
            choices = [SelectOptionDict(value=TRACKERS, label="Everyone with a phone")]
            choices += [
                SelectOptionDict(value=group_id, label=name)
                for group_id, name in sorted(groups.items(), key=lambda g: g[1])
            ]
            current = options.get(CONF_HOUSEHOLD_GROUP)
            schema[
                vol.Required(
                    CONF_HOUSEHOLD_GROUP,
                    default=current if current in groups else TRACKERS,
                )
            ] = SelectSelector(
                SelectSelectorConfig(options=choices, mode=SelectSelectorMode.DROPDOWN)
            )
        # What the wall panels' status lights follow (doors: the Exterior Door label)
        for key, domains in (
            (CONF_ALARM_PANEL, ["alarm_control_panel"]),
            (CONF_BEDTIME_ENTITY, ["input_boolean", "switch", "binary_sensor"]),
        ):
            schema[vol.Optional(key, description=_suggested(options.get(key)))] = (
                EntitySelector(EntitySelectorConfig(domain=domains))
            )
        return self.async_show_form(step_id="general", data_schema=vol.Schema(schema))

    async def async_step_house(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """What discovery can't tell: the announcing speaker, the voice…"""
        house = self._house()
        tts = house.get("tts") or {}
        if user_input is not None:
            house.update(
                {
                    key: user_input.get(key)
                    for key in (
                        "announce_speaker",
                        "weather",
                        "guest_wifi_qr",
                        "birthday_calendar",
                    )
                }
            )
            house["thermostats"] = user_input.get("thermostats") or None
            house["announce_speakers"] = user_input.get("announce_speakers") or None
            house["home_path"] = (user_input.get("home_path") or "").strip() or None
            for key in ("quiet_start", "quiet_end"):
                house[key] = user_input.get(key) or None
            house["tts"] = {
                "engine": user_input.get("tts_engine"),
                "voice": (user_input.get("tts_voice") or "").strip() or None,
                "streaming": bool(user_input.get("tts_streaming")),
                "fallback": user_input.get("tts_fallback"),
            }
            return self._save({CONF_HOUSE: house})

        def entity(key: str, domain: str, value: Any = None, multiple: bool = False):
            return {
                vol.Optional(
                    key,
                    description=_suggested(
                        value if value is not None else house.get(key)
                    ),
                ): (
                    EntitySelector(
                        EntitySelectorConfig(domain=domain, multiple=multiple)
                    )
                )
            }

        schema: dict[Any, Any] = {
            **entity("announce_speaker", "media_player"),
            **entity(
                "announce_speakers",
                "media_player",
                house.get("announce_speakers"),
                multiple=True,
            ),
            vol.Optional(
                "quiet_start", description=_suggested(house.get("quiet_start"))
            ): (TimeSelector()),
            vol.Optional("quiet_end", description=_suggested(house.get("quiet_end"))): (
                TimeSelector()
            ),
            **entity("weather", "weather"),
            **entity("thermostats", "climate", house.get("thermostats"), multiple=True),
            **entity("tts_engine", "tts", tts.get("engine")),
            vol.Optional(
                "tts_voice", description=_suggested(tts.get("voice"))
            ): TextSelector(),
            vol.Optional(
                "tts_streaming", default=bool(tts.get("streaming"))
            ): BooleanSelector(),
            **entity("tts_fallback", "tts", tts.get("fallback")),
            vol.Optional("home_path", description=_suggested(house.get("home_path"))): (
                TextSelector()
            ),
            **entity("guest_wifi_qr", "image"),
            **entity("birthday_calendar", "calendar"),
        }
        return self.async_show_form(step_id="house", data_schema=vol.Schema(schema))

    async def async_step_bedtime(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """The rooms with a bedtime switch, and when bedtime ends."""
        options = self.config_entry.options
        if user_input is not None:
            return self._save(
                {
                    CONF_BEDTIME_ROOMS: user_input.get(CONF_BEDTIME_ROOMS) or [],
                    CONF_BEDTIME_ENDS: user_input.get(
                        CONF_BEDTIME_ENDS, DEFAULT_BEDTIME_ENDS
                    ),
                }
            )
        schema = {
            vol.Optional(
                CONF_BEDTIME_ROOMS,
                description=_suggested(options.get(CONF_BEDTIME_ROOMS)),
            ): AreaSelector(AreaSelectorConfig(multiple=True)),
            vol.Required(
                CONF_BEDTIME_ENDS,
                default=options.get(CONF_BEDTIME_ENDS, DEFAULT_BEDTIME_ENDS),
            ): TimeSelector(),
        }
        return self.async_show_form(step_id="bedtime", data_schema=vol.Schema(schema))

    async def async_step_laundry(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """The washer's and dryer's machine state, job state, time remaining."""
        house = self._house()
        laundry = house.get("laundry") or {}
        if user_input is not None:
            house["laundry"] = {
                machine: {
                    part: user_input.get(f"{machine}_{part}") for part in LAUNDRY_PARTS
                }
                for machine in ("washer", "dryer")
            }
            return self._save({CONF_HOUSE: house})
        schema = {
            vol.Optional(
                f"{machine}_{part}",
                description=_suggested((laundry.get(machine) or {}).get(part)),
            ): EntitySelector(EntitySelectorConfig(domain="sensor"))
            for machine in ("washer", "dryer")
            for part in LAUNDRY_PARTS
        }
        return self.async_show_form(step_id="laundry", data_schema=vol.Schema(schema))


LAUNDRY_PARTS = ("machine_state", "job_state", "time_remaining")


def _suggested(value: Any) -> dict[str, Any]:
    return {"suggested_value": value}


def _panel_schema(data: dict[str, Any]) -> vol.Schema:
    """A wall panel's form: its name and device; its hardware only to override."""

    def suggested(key: str) -> dict[str, Any]:
        return {"suggested_value": data.get(key)}

    return vol.Schema(
        {
            vol.Required("name", default=data.get("name", "")): TextSelector(),
            vol.Optional(CONF_DEVICE, description=suggested(CONF_DEVICE)): (
                DeviceSelector(DeviceSelectorConfig())
            ),
            vol.Optional(CONF_STATUS_LIGHT, description=suggested(CONF_STATUS_LIGHT)): (
                EntitySelector(EntitySelectorConfig(domain="light"))
            ),
            vol.Optional(CONF_WAKE, description=suggested(CONF_WAKE)): EntitySelector(
                EntitySelectorConfig(domain=["button", "switch"])
            ),
            vol.Optional(CONF_RELOAD, description=suggested(CONF_RELOAD)): (
                EntitySelector(EntitySelectorConfig(domain="button"))
            ),
        }
    )


def _panel_data(user_input: dict[str, Any]) -> dict[str, Any]:
    return {
        key: user_input.get(key)
        for key in (CONF_DEVICE, CONF_STATUS_LIGHT, CONF_WAKE, CONF_RELOAD)
    }


class WallPanelSubentryFlow(ConfigSubentryFlow):
    """Add or change a wall panel: its name, device and hardware."""

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Add one."""
        if user_input is not None:
            return self.async_create_entry(
                title=user_input["name"].strip(), data=_panel_data(user_input)
            )
        return self.async_show_form(step_id="user", data_schema=_panel_schema({}))

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Change one."""
        subentry = self._get_reconfigure_subentry()
        if user_input is not None:
            return self.async_update_and_abort(
                self._get_entry(),
                subentry,
                title=user_input["name"].strip(),
                data=_panel_data(user_input),
            )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=_panel_schema({"name": subentry.title, **subentry.data}),
        )
