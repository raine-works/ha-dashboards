"""A wall panel's hardware, found on its device: whatever the tablet offers.

- status light: the device's light (a ROAMiQ panel's LED; a strip some build in)
- wake: a button or switch named for waking or the screen (ROAMiQ's "Wake
  Screen" button; Fully Kiosk Browser's "Screen" switch, which turns it on)
- reload: a button with the restart device class (ROAMiQ's "Reload"; Fully
  Kiosk's "Restart browser")

A tablet that has none of them (an old one in a browser) still runs the
dashboards; it just isn't woken, reloaded or lit.
"""

from __future__ import annotations

from dataclasses import dataclass
import re

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

WAKE = re.compile(r"\b(wake|screen)\b", re.IGNORECASE)
# What isn't a wake: the screensaver, brightness, the screen's timeout
NOT_WAKE = re.compile(r"saver|bright|timeout|off|sleep|lock", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class PanelHardware:
    """A panel's controls, as entity ids (None: it hasn't one)."""

    status_light: str | None = None
    wake: str | None = None
    reload: str | None = None


@dataclass(frozen=True, slots=True)
class DeviceEntity:
    """What the search reads of one of the device's entities."""

    entity_id: str
    name: str
    device_class: str | None = None


def find_hardware(entities: list[DeviceEntity]) -> PanelHardware:
    """The status light, wake and reload among a device's entities."""
    by_id = sorted(entities, key=lambda e: e.entity_id)
    lights = [e for e in by_id if e.entity_id.startswith("light.")]
    wake = next(
        (
            e
            for e in by_id
            if e.entity_id.split(".")[0] in ("button", "switch")
            and WAKE.search(e.name)
            and not NOT_WAKE.search(e.name)
        ),
        None,
    )
    reload = next(
        (
            e
            for e in by_id
            if e.entity_id.startswith("button.") and e.device_class == "restart"
        ),
        None,
    )
    return PanelHardware(
        status_light=lights[0].entity_id if len(lights) == 1 else None,
        wake=wake.entity_id if wake else None,
        reload=reload.entity_id if reload else None,
    )


def device_hardware(hass: HomeAssistant, device_id: str) -> PanelHardware:
    """The hardware on a device, from the entity registry (not disabled ones)."""
    registry = er.async_get(hass)
    return find_hardware(
        [
            DeviceEntity(
                entity_id=entry.entity_id,
                name=entry.name or entry.original_name or "",
                device_class=entry.device_class or entry.original_device_class,
            )
            for entry in er.async_entries_for_device(registry, device_id)
            if not entry.disabled
        ]
    )
