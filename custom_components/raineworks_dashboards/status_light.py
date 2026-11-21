"""What a wall panel's status light shows: the house's state as one color.

Highest priority first: the alarm triggered = pulsing red; arming (the exit
delay) or the entry delay = pulsing amber, at the red's pace; an exterior door
open = steady amber; armed = steady green; otherwise off. While the house is in
bedtime everything but the triggered red shows at 10%. Pure: the panel driver
(planned) turns it into light.turn_on calls on each panel's light, whatever the
hardware (a ROAMiQ panel's LED, a strip behind a tablet).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RED = (255, 0, 0)
AMBER = (255, 110, 0)
DOOR_AMBER = (255, 140, 0)
GREEN = (0, 255, 0)

# Brightness 0-255: full, and a pulse's low point; in bedtime, 10% of each
BRIGHT, DIM = 255, 25
BEDTIME_BRIGHT, BEDTIME_DIM = 26, 3

# A pulse: up for this long, then down for as long (each a 0.4s transition)
PULSE_HALF_S = 0.5

ARMED = frozenset(
    {
        "armed_home",
        "armed_away",
        "armed_night",
        "armed_vacation",
        "armed_custom_bypass",
    }
)
DELAY = frozenset({"arming", "pending"})


@dataclass(frozen=True, slots=True)
class StatusLight:
    """One status: off, a steady color, or a color pulsing between two brightnesses."""

    mode: Literal["off", "steady", "pulse"]
    rgb: tuple[int, int, int] | None = None
    brightness: int = 0
    # A pulse's low point
    low: int | None = None


OFF = StatusLight("off")


def status_light(alarm: str | None, door_open: bool, bedtime: bool) -> StatusLight:
    """The status for an alarm state, whether an exterior door is open, and bedtime."""
    bright, dim = (BEDTIME_BRIGHT, BEDTIME_DIM) if bedtime else (BRIGHT, DIM)
    if alarm == "triggered":
        # Never dimmed: it's the one that has to be seen
        return StatusLight("pulse", RED, BRIGHT, DIM)
    if alarm in DELAY:
        return StatusLight("pulse", AMBER, bright, dim)
    if door_open:
        return StatusLight("steady", DOOR_AMBER, bright)
    if alarm in ARMED:
        return StatusLight("steady", GREEN, bright)
    return OFF
