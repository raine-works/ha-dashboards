"""Each household member's daily affirmation."""

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
import pytest


async def test_a_member_keeps_their_former_affirmation(
    hass: HomeAssistant, people, setup
) -> None:
    hass.states.async_set(
        "input_text.daily_affirmation_alex",
        '{"at": 1795280400, "text": "You are kind."}',
    )
    await setup()
    alex = hass.states.get("sensor.daily_affirmation_alex")
    assert alex.attributes["text"] == "You are kind."
    assert alex.attributes["device_class"] == "timestamp"
    assert alex.state.startswith("2026-11-21T")
    # Sam had none yet
    assert hass.states.get("sensor.daily_affirmation_sam").state == "unknown"
    # Only the household (people with phones here)
    assert hass.states.get("sensor.daily_affirmation_admin") is None


async def test_the_action_writes_one(hass: HomeAssistant, people, setup) -> None:
    await setup()
    long = "You are steady. " * 30
    await hass.services.async_call(
        "raineworks_dashboards",
        "set_affirmation",
        {"person": "person.sam", "text": long},
        blocking=True,
    )
    sam = hass.states.get("sensor.daily_affirmation_sam")
    # Not cut to a state's 255 characters
    assert sam.attributes["text"] == long.strip()
    assert sam.state != "unknown"
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            "raineworks_dashboards",
            "set_affirmation",
            {"person": "person.admin", "text": "Hi"},
            blocking=True,
        )
