"""Who the household is, and the info command the dashboards read it from."""

from homeassistant.core import HomeAssistant

from custom_components.raineworks_dashboards.const import CONF_HOUSEHOLD_GROUP
from custom_components.raineworks_dashboards.household import household, warden_groups


async def test_household_is_everyone_with_a_phone_without_warden(
    hass: HomeAssistant, people
) -> None:
    assert warden_groups(hass) is None
    assert household(hass, None) == (["person.alex", "person.sam"], "trackers")
    # A group picked once, with Warden gone since
    assert household(hass, "g-family") == (["person.alex", "person.sam"], "trackers")


async def test_household_is_a_warden_groups_members(
    hass: HomeAssistant, people, warden
) -> None:
    assert warden_groups(hass) == {"g-family": "Family", "g-guests": "Guests"}
    # Members by their person's user, phone or not
    assert household(hass, "g-family") == (["person.admin", "person.alex"], "warden")
    assert household(hass, "g-guests") == ([], "warden")
    # A group that's been deleted: back to everyone with a phone
    assert household(hass, "g-gone") == (["person.alex", "person.sam"], "trackers")


async def test_info_command(
    hass: HomeAssistant, hass_ws_client, people, warden, setup
) -> None:
    await setup({CONF_HOUSEHOLD_GROUP: "g-family"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "raineworks_dashboards/info"})
    result = (await client.receive_json())["result"]
    assert result["household"] == ["person.admin", "person.alex"]
    assert result["household_source"] == "warden"
    assert result["version"] == "0.1.0"


async def test_household_through_wardens_public_api(
    hass: HomeAssistant, people, monkeypatch
) -> None:
    """Warden 0.3.2+: its api module, not its manager's internals."""
    from types import SimpleNamespace

    from custom_components.raineworks_dashboards import household as module

    group = SimpleNamespace(id="g-kids", name="Kids", members=frozenset({"u-sam"}))
    api = SimpleNamespace(async_get_groups=lambda hass: [group])
    monkeypatch.setattr(module, "_warden_api", lambda: api)
    assert warden_groups(hass) == {"g-kids": "Kids"}
    assert household(hass, "g-kids") == (["person.sam"], "warden")


async def test_info_names_only_the_people_the_user_may_read(
    hass: HomeAssistant, hass_ws_client, hass_admin_user, people, setup
) -> None:
    """A user limited to some entities (a Warden group's) learns no other people."""
    await setup()
    hass_admin_user.mock_policy({"entities": {"entity_ids": {"person.alex": True}}})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "raineworks_dashboards/info"})
    result = (await client.receive_json())["result"]
    assert result["household"] == ["person.alex"]
