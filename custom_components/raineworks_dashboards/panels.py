"""The wall panels' hardware: each panel's status light, waking them on a doorbell
ring, and reloading them.

Each wall panel is a subentry (SUBENTRY_WALL_PANEL) naming its device and, where
the device search can't tell, its light, wake and reload. A panel without one
of them just goes without it.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.start import async_at_started

from .const import (
    CONF_ALARM_PANEL,
    CONF_BEDTIME_ENTITY,
    CONF_BEDTIME_ROOMS,
    CONF_DEVICE,
    CONF_RELOAD,
    CONF_STATUS_LIGHT,
    CONF_WAKE,
    EXTERIOR_DOOR_LABEL,
    SUBENTRY_WALL_PANEL,
)
from .hardware import PanelHardware, device_hardware
from .status_light import OFF, PULSE_HALF_S, StatusLight, status_light

_LOGGER = logging.getLogger(__name__)

NOT_THERE = (STATE_UNAVAILABLE, STATE_UNKNOWN)
OPEN = ("on", "open", "opening")


@dataclass(frozen=True, slots=True)
class WallPanel:
    """A registered panel: its name and hardware."""

    name: str
    hardware: PanelHardware


def wall_panels(hass: HomeAssistant, entry: ConfigEntry) -> list[WallPanel]:
    """The entry's panels: each subentry's hardware, its picks over its device's."""
    panels = []
    for subentry in entry.subentries.values():
        if subentry.subentry_type != SUBENTRY_WALL_PANEL:
            continue
        data = subentry.data
        found = (
            device_hardware(hass, data[CONF_DEVICE])
            if data.get(CONF_DEVICE)
            else PanelHardware()
        )
        panels.append(
            WallPanel(
                subentry.title,
                PanelHardware(
                    status_light=data.get(CONF_STATUS_LIGHT) or found.status_light,
                    wake=data.get(CONF_WAKE) or found.wake,
                    reload=data.get(CONF_RELOAD) or found.reload,
                ),
            )
        )
    return panels


def find_alarm_panel(hass: HomeAssistant, configured: str | None) -> str | None:
    """The alarm panel: the option's, else Alarmo's, else the first."""
    if configured:
        return configured
    panels = sorted(hass.states.async_entity_ids("alarm_control_panel"))
    registry = er.async_get(hass)
    alarmo = [
        p for p in panels if (e := registry.async_get(p)) and e.platform == "alarmo"
    ]
    return (alarmo or panels or [None])[0]


def exterior_doors(hass: HomeAssistant) -> list[str]:
    """The entities labeled Exterior Door."""
    return sorted(
        entry.entity_id
        for entry in er.async_entries_for_label(er.async_get(hass), EXTERIOR_DOOR_LABEL)
    )


def doorbells(hass: HomeAssistant) -> list[str]:
    """Every doorbell event entity (device class doorbell)."""
    registry = er.async_get(hass)
    return sorted(
        entry.entity_id
        for entry in registry.entities.values()
        if entry.domain == "event"
        and (entry.device_class or entry.original_device_class) == "doorbell"
        and not entry.disabled
    )


class PanelsController:
    """Drives every panel's status light and wakes them on a ring."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.panels = wall_panels(hass, entry)
        self._shown: StatusLight | None = None
        self._pulse: asyncio.Task | None = None
        self._unsub: list[Callable[[], None]] = []
        self._unsub_states: Callable[[], None] | None = None

    @property
    def _lights(self) -> list[str]:
        return [p.hardware.status_light for p in self.panels if p.hardware.status_light]

    @callback
    def async_start(self) -> None:
        """Follow the house; show the status once Home Assistant has started."""
        if not self.panels:
            return
        self._track()
        self._unsub.append(
            self.hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, self._registry)
        )
        self._unsub.append(async_at_started(self.hass, self._started))

    @callback
    def async_stop(self) -> None:
        """Stop following and pulsing; the lights keep what they show."""
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        self._stop_pulse()

    async def _started(self, _hass: HomeAssistant) -> None:
        self._update(force=True)

    @callback
    def _registry(self, _event: Event) -> None:
        # A door labeled or unlabeled, a doorbell added: follow the new set
        self._track()
        self._update()

    @callback
    def _track(self) -> None:
        if self._unsub_states:
            self._unsub_states()
        options = self.entry.options
        self._alarm = find_alarm_panel(self.hass, options.get(CONF_ALARM_PANEL))
        # Else the integration's own Home Bedtime, when it has bedtime rooms
        self._bedtime = options.get(CONF_BEDTIME_ENTITY) or (
            "switch.home_bedtime" if options.get(CONF_BEDTIME_ROOMS) else None
        )
        self._doors = exterior_doors(self.hass)
        self._doorbells = doorbells(self.hass)
        watched = {*self._doors, *self._doorbells}
        watched |= {e for e in (self._alarm, self._bedtime) if e}
        self._unsub_states = async_track_state_change_event(
            self.hass, sorted(watched), self._changed
        )

    @callback
    def _changed(self, event: Event) -> None:
        if event.data["entity_id"] in self._doorbells:
            old, new = event.data.get("old_state"), event.data.get("new_state")
            # An event entity's state is the time of its last event: a new one, not
            # its coming back after a restart
            if (
                old is not None
                and new is not None
                and old.state not in NOT_THERE
                and new.state not in NOT_THERE
                and new.attributes.get("event_type", "ring") == "ring"
            ):
                self.async_wake()
            return
        self._update()

    def current_status(self) -> StatusLight:
        """The status the house is in now."""
        state = self.hass.states.get
        alarm = state(self._alarm).state if self._alarm and state(self._alarm) else None
        door_open = any((s := state(d)) and s.state in OPEN for d in self._doors)
        bedtime = bool(
            self._bedtime and (s := state(self._bedtime)) and s.state == "on"
        )
        return status_light(alarm, door_open, bedtime)

    @callback
    def _update(self, force: bool = False) -> None:
        if not self._lights:
            return
        status = self.current_status()
        if status == self._shown and not force:
            return
        self._shown = status
        self._stop_pulse()
        if status.mode == "pulse":
            self._pulse = self.entry.async_create_background_task(
                self.hass, self._run_pulse(status), "raineworks_dashboards status pulse"
            )
        else:
            self.hass.async_create_task(self._show(status))

    def _stop_pulse(self) -> None:
        if self._pulse:
            self._pulse.cancel()
            self._pulse = None

    async def _call(self, domain: str, service: str, data: dict[str, Any]) -> None:
        try:
            await self.hass.services.async_call(domain, service, data, blocking=True)
        except Exception:  # A panel offline: the others still get it
            _LOGGER.debug("%s.%s failed for %s", domain, service, data, exc_info=True)

    async def _light(
        self, rgb: tuple[int, int, int], brightness: int, transition: float
    ) -> None:
        await asyncio.gather(
            *(
                self._call(
                    "light",
                    "turn_on",
                    {
                        "entity_id": light,
                        "rgb_color": list(rgb),
                        "brightness": brightness,
                        "transition": transition,
                    },
                )
                for light in self._lights
            )
        )

    async def _show(self, status: StatusLight) -> None:
        if status == OFF or status.rgb is None:
            await asyncio.gather(
                *(
                    self._call(
                        "light", "turn_off", {"entity_id": light, "transition": 1}
                    )
                    for light in self._lights
                )
            )
        else:
            await self._light(status.rgb, status.brightness, 1)

    async def _run_pulse(self, status: StatusLight) -> None:
        assert status.rgb is not None and status.low is not None
        while True:
            await self._light(status.rgb, status.brightness, 0.4)
            await asyncio.sleep(PULSE_HALF_S)
            await self._light(status.rgb, status.low, 0.4)
            await asyncio.sleep(PULSE_HALF_S)

    @callback
    def async_wake(self) -> None:
        """Wake every panel's screen (a doorbell ring: its view opens on them)."""
        for panel in self.panels:
            if wake := panel.hardware.wake:
                domain = wake.split(".")[0]
                service = "press" if domain == "button" else "turn_on"
                self.hass.async_create_task(
                    self._call(domain, service, {"entity_id": wake})
                )

    async def async_reload(self) -> None:
        """Reload every panel's dashboard (one with a reload button)."""
        await asyncio.gather(
            *(
                self._call("button", "press", {"entity_id": p.hardware.reload})
                for p in self.panels
                if p.hardware.reload
            )
        )
