"""The wall panels' status light: the same priorities as the house's LED automation."""

import pytest

from custom_components.raineworks_dashboards.status_light import (
    OFF,
    StatusLight,
    status_light,
)


@pytest.mark.parametrize(
    ("alarm", "door_open", "bedtime", "expected"),
    [
        # Triggered wins over everything, and is never dimmed
        ("triggered", True, True, StatusLight("pulse", (255, 0, 0), 255, 25)),
        # The exit and entry delays pulse amber, dimmed in bedtime
        ("arming", True, False, StatusLight("pulse", (255, 110, 0), 255, 25)),
        ("pending", False, True, StatusLight("pulse", (255, 110, 0), 26, 3)),
        # An open exterior door beats armed
        ("armed_home", True, False, StatusLight("steady", (255, 140, 0), 255)),
        ("disarmed", True, True, StatusLight("steady", (255, 140, 0), 26)),
        ("armed_away", False, False, StatusLight("steady", (0, 255, 0), 255)),
        ("armed_custom_bypass", False, True, StatusLight("steady", (0, 255, 0), 26)),
        ("disarmed", False, False, OFF),
        # No alarm panel at all: doors still show
        (None, True, False, StatusLight("steady", (255, 140, 0), 255)),
        (None, False, False, OFF),
        ("unavailable", False, False, OFF),
    ],
)
def test_status_light(alarm, door_open, bedtime, expected) -> None:
    assert status_light(alarm, door_open, bedtime) == expected
