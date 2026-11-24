"""Each household member's push categories: notify_people skips what they turned off."""

from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.raineworks_dashboards.push import CATEGORIES


@pytest.fixture
def phones(hass: HomeAssistant, hass_admin_user) -> None:
    """Alex (signed in as the test's user) and Sam, each with a phone."""
    app = MockConfigEntry(domain="mobile_app")
    app.add_to_hass(hass)
    devices = dr.async_get(hass)
    entities = er.async_get(hass)
    for person, phone in (("alex", "Alex Phone"), ("sam", "Sam Phone")):
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
        {"user_id": hass_admin_user.id, "device_trackers": ["device_tracker.alex"]},
    )
    hass.states.async_set(
        "person.sam",
        "home",
        {"user_id": "u-sam", "device_trackers": ["device_tracker.sam"]},
    )


async def _set(client, category: str, enabled: bool) -> dict:
    await client.send_json_auto_id(
        {
            "type": "raineworks_dashboards/push/set",
            "category": category,
            "enabled": enabled,
        }
    )
    return await client.receive_json()


async def _notify(hass: HomeAssistant, category: str | None) -> dict:
    data = {"title": "T", "message": "M"}
    if category:
        data["category"] = category
    return await hass.services.async_call(
        "raineworks_dashboards",
        "notify_people",
        data,
        blocking=True,
        return_response=True,
    )


async def test_everything_is_on_until_turned_off(
    hass: HomeAssistant, hass_ws_client, phones, setup
) -> None:
    await setup()
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "raineworks_dashboards/push/preferences"})
    response = await client.receive_json()
    assert response["result"]["person"] == "person.alex"
    categories = response["result"]["categories"]
    assert [c["id"] for c in categories] == [c.id for c in CATEGORIES]
    assert all(c["enabled"] for c in categories)
    assert next(c for c in categories if c["id"] == "security")["always"] is True


async def test_a_category_turned_off_skips_that_persons_phones(
    hass: HomeAssistant, hass_ws_client, phones, setup
) -> None:
    alex = async_mock_service(hass, "notify", "mobile_app_alex_phone")
    sam = async_mock_service(hass, "notify", "mobile_app_sam_phone")
    await setup()
    client = await hass_ws_client(hass)
    response = await _set(client, "laundry", False)
    assert response["success"]
    assert not next(
        c for c in response["result"]["categories"] if c["id"] == "laundry"
    )["enabled"]

    result = await _notify(hass, "laundry")
    assert result == {"sent": ["mobile_app_sam_phone"], "skipped": ["person.alex"]}
    assert (len(alex), len(sam)) == (0, 1)

    # Other categories, and pushes without one, still reach Alex
    await _notify(hass, "doorbell")
    await _notify(hass, None)
    assert len(alex) == 2

    # And back on
    await _set(client, "laundry", True)
    await _notify(hass, "laundry")
    assert len(alex) == 3


async def test_security_always_comes_through(
    hass: HomeAssistant, hass_ws_client, phones, setup
) -> None:
    alex = async_mock_service(hass, "notify", "mobile_app_alex_phone")
    async_mock_service(hass, "notify", "mobile_app_sam_phone")
    await setup()
    client = await hass_ws_client(hass)
    response = await _set(client, "security", False)
    assert not response["success"]
    assert response["error"]["code"] == "always_on"
    await _notify(hass, "security")
    assert len(alex) == 1


async def test_an_unknown_category_goes_to_everyone(
    hass: HomeAssistant, phones, setup
) -> None:
    async_mock_service(hass, "notify", "mobile_app_alex_phone")
    async_mock_service(hass, "notify", "mobile_app_sam_phone")
    await setup()
    result = await _notify(hass, "weather")
    assert result["skipped"] == []
    assert len(result["sent"]) == 2


async def test_only_household_members_have_settings(
    hass: HomeAssistant, hass_ws_client, setup
) -> None:
    # No person is the signed-in user (the admin, a wall panel's shared user)
    hass.states.async_set(
        "person.sam", "home", {"user_id": "u-sam", "device_trackers": []}
    )
    await setup()
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "raineworks_dashboards/push/preferences"})
    response = await client.receive_json()
    assert response["result"]["person"] is None
    response = await _set(client, "laundry", False)
    assert response["error"]["code"] == "not_a_member"


async def test_an_unknown_category_cannot_be_set(
    hass: HomeAssistant, hass_ws_client, phones, setup
) -> None:
    await setup()
    client = await hass_ws_client(hass)
    response = await _set(client, "weather", False)
    assert response["error"]["code"] == "unknown_category"


async def test_the_choices_are_kept(
    hass: HomeAssistant, hass_ws_client, hass_storage, phones, setup
) -> None:
    await setup()
    client = await hass_ws_client(hass)
    await _set(client, "daily", False)
    await hass.async_block_till_done()
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=5))
    await hass.async_block_till_done()
    assert hass_storage["raineworks_dashboards.push"]["data"] == {
        "off": {"person.alex": ["daily"]}
    }
