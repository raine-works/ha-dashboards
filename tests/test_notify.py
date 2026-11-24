"""Pushes to household members' phones, and the config entry lookup for any user."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_mock_service,
)


@pytest.fixture
def phones(hass: HomeAssistant) -> None:
    """Alex's and Sam's phones (Sam's app removed); the admin has none."""
    app = MockConfigEntry(domain="mobile_app")
    app.add_to_hass(hass)
    devices = dr.async_get(hass)
    entities = er.async_get(hass)
    for person, phone in (("alex", "Alex's Phone"), ("sam", "Sam Pixel")):
        device = devices.async_get_or_create(
            config_entry_id=app.entry_id,
            identifiers={("mobile_app", person)},
            name=phone,
        )
        entities.async_get_or_create(
            "device_tracker",
            "mobile_app",
            person,
            suggested_object_id=person,
            device_id=device.id,
            config_entry=app,
        )
    hass.states.async_set(
        "person.alex",
        "home",
        {"user_id": "u-alex", "device_trackers": ["device_tracker.alex"]},
    )
    hass.states.async_set(
        "person.sam",
        "home",
        {"user_id": "u-sam", "device_trackers": ["device_tracker.sam"]},
    )
    hass.states.async_set("person.admin", "unknown", {"device_trackers": []})


async def test_everyone_in_the_household_by_default(
    hass: HomeAssistant, phones, setup
) -> None:
    alex = async_mock_service(hass, "notify", "mobile_app_alex_s_phone")
    sam = async_mock_service(hass, "notify", "mobile_app_sam_pixel")
    await setup()
    response = await hass.services.async_call(
        "raineworks_dashboards",
        "notify_people",
        {"title": "From home", "message": "Dinner", "data": {"tag": "dinner"}},
        blocking=True,
        return_response=True,
    )
    assert response == {
        "sent": ["mobile_app_alex_s_phone", "mobile_app_sam_pixel"],
        "skipped": [],
    }
    assert dict(alex[0].data) == {
        "title": "From home",
        "message": "Dinner",
        "data": {"tag": "dinner"},
    }
    assert len(sam) == 1


async def test_picked_people_less_the_excluded(
    hass: HomeAssistant, phones, setup
) -> None:
    alex = async_mock_service(hass, "notify", "mobile_app_alex_s_phone")
    # Sam's app is gone: no such action, so it's skipped rather than failing the rest
    await setup()
    await hass.services.async_call(
        "raineworks_dashboards",
        "notify_people",
        {
            "people": ["person.alex", "person.sam"],
            "exclude": ["person.sam"],
            "title": "T",
            "message": "M",
        },
        blocking=True,
    )
    assert len(alex) == 1
    response = await hass.services.async_call(
        "raineworks_dashboards",
        "notify_people",
        {"people": ["person.sam"], "title": "T", "message": "M"},
        blocking=True,
        return_response=True,
    )
    assert response == {"sent": [], "skipped": []}


async def test_config_entry_for_what_the_user_may_read(
    hass: HomeAssistant, hass_ws_client, hass_admin_user, setup
) -> None:
    await setup()
    music = MockConfigEntry(domain="music_assistant")
    music.add_to_hass(hass)
    er.async_get(hass).async_get_or_create(
        "media_player",
        "music_assistant",
        "kitchen",
        suggested_object_id="kitchen",
        config_entry=music,
    )
    hass_admin_user.mock_policy(
        {"entities": {"entity_ids": {"media_player.kitchen": True}}}
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "raineworks_dashboards/config_entry",
            "entity_id": "media_player.kitchen",
        }
    )
    assert (await client.receive_json())["result"] == {
        "config_entry_id": music.entry_id
    }
    await client.send_json_auto_id(
        {"type": "raineworks_dashboards/config_entry", "entity_id": "lock.front"}
    )
    assert (await client.receive_json())["error"]["code"] == "unauthorized"
