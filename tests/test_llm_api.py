"""The setup tools: an assistant checks and sets the dashboards up through them."""

from __future__ import annotations

import json
from typing import Any

from homeassistant.auth.models import User
from homeassistant.components import frontend
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
    floor_registry as fr,
    label_registry as lr,
    llm,
)
from mcp.shared.memory import create_connected_server_and_client_session
import probatio
import pytest

from custom_components.raineworks_dashboards.llm_api import LLM_API_ID, LLM_API_NAME


def _context(user: User | None) -> llm.LLMContext:
    return llm.LLMContext(
        platform="test",
        context=Context(user_id=user.id) if user else None,
        language="*",
        assistant="conversation",
        device_id=None,
    )


async def _call(
    hass: HomeAssistant,
    user: User | None,
    tool: str,
    args: dict[str, Any] | None = None,
) -> Any:
    api = await llm.async_get_api(hass, LLM_API_ID, _context(user))
    result = await api.async_call_tool(
        llm.ToolInput(tool_name=tool, tool_args=args or {})
    )
    assert not result.error
    return result.data


@pytest.fixture
async def entry(hass: HomeAssistant, setup):
    """The integration, set up."""
    return await setup()


async def test_the_tools_come_and_go_with_the_integration(
    hass: HomeAssistant, entry
) -> None:
    """Registered while the integration is loaded, gone once it's unloaded."""
    apis = {api.id: api.name for api in llm.async_get_apis(hass)}
    assert apis[LLM_API_ID] == LLM_API_NAME
    instance = await llm.async_get_api(hass, LLM_API_ID, _context(None))
    tools = {tool.name: tool for tool in instance.tools}
    assert set(tools) == {
        "integration_status",
        "capability_report",
        "list_floors",
        "find_unlabeled_lights",
        "label_household_lights",
        "create_dashboard",
        "check_house_settings",
        "set_default_dashboard",
        "set_house_theme",
        "find_wall_panel_devices",
        "add_wall_panel",
    }
    # Only those that change Home Assistant say they do
    writes = {name for name, tool in tools.items() if not tool.annotations.read_only}
    assert writes == {
        "label_household_lights",
        "create_dashboard",
        "set_default_dashboard",
        "set_house_theme",
        "add_wall_panel",
    }
    assert "integration_status" in instance.api_prompt

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert LLM_API_ID not in {api.id for api in llm.async_get_apis(hass)}


@pytest.mark.parametrize("who", ["nobody", "non-admin"])
async def test_only_administrators_may_use_them(
    hass: HomeAssistant, entry, hass_read_only_user: User, who: str
) -> None:
    """A voice satellite (no user) or a non-admin's token is refused, reads too."""
    user = None if who == "nobody" else hass_read_only_user
    api = await llm.async_get_api(hass, LLM_API_ID, _context(user))
    for tool in ("integration_status", "find_unlabeled_lights"):
        with pytest.raises(HomeAssistantError, match="for administrators"):
            await api.async_call_tool(llm.ToolInput(tool_name=tool, tool_args={}))
    with pytest.raises(HomeAssistantError, match="for administrators"):
        await api.async_call_tool(
            llm.ToolInput(
                tool_name="label_household_lights",
                tool_args={"entity_ids": ["light.desk"]},
            )
        )
    assert lr.async_get(hass).async_get_label("household_light") is None


async def test_integration_status(
    hass: HomeAssistant, setup, hass_admin_user: User, people
) -> None:
    """The version, the household, the house settings and the dashboards."""
    await setup({"house": {"weather": "weather.home"}})
    status = await _call(hass, hass_admin_user, "integration_status")
    assert status["state"] == "loaded"
    assert status["version"]
    assert status["household"] == ["person.alex", "person.sam"]
    assert status["house_settings"] == {"weather": "weather.home"}
    assert "custom:wall-panel-dashboard" in status["cards"]


async def test_capability_report(
    hass: HomeAssistant, setup, hass_admin_user: User
) -> None:
    """What this house has, what's missing and what it needs, and what's off."""
    await setup({"house": {"modules": {"holidays": False}}})
    hass.states.async_set("camera.porch", "idle")
    report = await _call(hass, hass_admin_user, "capability_report")
    assert "Cameras" in report["on"]
    assert report["off"] == ["Holidays"]
    missing = {row["module"]: row["needs"] for row in report["missing"]}
    assert "Music Assistant" in missing["Music"]

    # A card's own settings win over the integration's, key by key
    report = await _call(
        hass,
        hass_admin_user,
        "capability_report",
        {"house_yaml": "modules:\n  holidays: yes\n  cameras: no\n"},
    )
    assert "Holidays" in report["on"]
    assert report["off"] == ["Cameras"]

    api = await llm.async_get_api(hass, LLM_API_ID, _context(hass_admin_user))
    with pytest.raises(HomeAssistantError, match="valid YAML"):
        await api.async_call_tool(
            llm.ToolInput(
                tool_name="capability_report", tool_args={"house_yaml": "a: ["}
            )
        )


@pytest.mark.parametrize(
    ("tool", "arg"),
    [("capability_report", "house_yaml"), ("check_house_settings", "yaml")],
)
@pytest.mark.parametrize(
    "tag", ["!include {secret}", "!env_var RAINEWORKS_TEST_SECRET", "!secret token"]
)
async def test_yaml_tags_never_reach_files_or_the_environment(
    hass: HomeAssistant,
    entry,
    hass_admin_user: User,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    tool: str,
    arg: str,
    tag: str,
) -> None:
    """An assistant's YAML is plain data: Home Assistant's config tags are refused."""
    secret = tmp_path / "secrets.yaml"
    secret.write_text("token: hunter2-not-for-assistants\n")
    monkeypatch.setenv("RAINEWORKS_TEST_SECRET", "hunter2-not-for-assistants")
    api = await llm.async_get_api(hass, LLM_API_ID, _context(hass_admin_user))
    text = f"weather: {tag.format(secret=secret)}\n"
    with pytest.raises(HomeAssistantError, match="valid YAML") as err:
        await api.async_call_tool(llm.ToolInput(tool_name=tool, tool_args={arg: text}))
    assert "hunter2" not in str(err.value)


async def test_list_floors(hass: HomeAssistant, entry, hass_admin_user: User) -> None:
    """Floors with their areas, and the areas on no floor."""
    floor = fr.async_get(hass).async_create("Main floor", level=1)
    ar.async_get(hass).async_create("Kitchen", floor_id=floor.floor_id)
    ar.async_get(hass).async_create("Shed")
    floors = await _call(hass, hass_admin_user, "list_floors")
    assert floors["floors"] == [
        {
            "floor_id": floor.floor_id,
            "name": "Main floor",
            "level": 1,
            "areas": ["Kitchen"],
        }
    ]
    assert "Shed" in floors["areas_without_a_floor"]


async def test_finding_and_labeling_lights(
    hass: HomeAssistant, entry, hass_admin_user: User
) -> None:
    """Unlabeled lights (indicators flagged), then labeled, the label made first."""
    config = entry.entry_id
    kitchen = ar.async_get(hass).async_create("Kitchen")
    panel = dr.async_get(hass).async_get_or_create(
        config_entry_id=config,
        identifiers={("test", "panel")},
        name="Panel",
        model="Status LED",
    )
    entities = er.async_get(hass)
    desk = entities.async_get_or_create(
        "light", "test", "desk", suggested_object_id="desk"
    )
    entities.async_update_entity(desk.entity_id, area_id=kitchen.id)
    entities.async_get_or_create(
        "light", "test", "panel", suggested_object_id="panel_led", device_id=panel.id
    )
    hidden = entities.async_get_or_create("light", "test", "hidden")
    entities.async_update_entity(hidden.entity_id, hidden_by=er.RegistryEntryHider.USER)
    hass.states.async_set("light.desk", "on", {"friendly_name": "Desk lamp"})

    found = (await _call(hass, hass_admin_user, "find_unlabeled_lights"))["lights"]
    assert [
        (light["entity_id"], light["looks_like_an_indicator"]) for light in found
    ] == [
        ("light.desk", False),
        ("light.panel_led", True),
    ]
    assert found[0]["area"] == "Kitchen" and found[0]["name"] == "Desk lamp"

    result = await _call(
        hass,
        hass_admin_user,
        "label_household_lights",
        {"entity_ids": ["light.desk", "light.desk"]},
    )
    assert result == {"labeled": ["light.desk"], "already_labeled": []}
    assert (
        lr.async_get(hass).async_get_label("household_light").name == "Household Light"
    )
    assert "household_light" in entities.async_get("light.desk").labels
    again = await _call(
        hass, hass_admin_user, "label_household_lights", {"entity_ids": ["light.desk"]}
    )
    assert again == {"labeled": [], "already_labeled": ["light.desk"]}
    assert [
        light["entity_id"]
        for light in (await _call(hass, hass_admin_user, "find_unlabeled_lights"))[
            "lights"
        ]
    ] == ["light.panel_led"]


@pytest.mark.parametrize(
    ("args", "error"),
    [
        ({"entity_ids": ["switch.desk"]}, "light"),
        ({"entity_ids": []}, "light"),
        ({"entity_ids": ["light.nowhere"]}, "not found"),
    ],
)
async def test_labeling_only_lights_that_exist(
    hass: HomeAssistant, entry, hass_admin_user: User, args: dict, error: str
) -> None:
    """Anything but a light's entity id is refused."""
    api = await llm.async_get_api(hass, LLM_API_ID, _context(hass_admin_user))
    with pytest.raises(HomeAssistantError, match=error):
        await api.async_call_tool(
            llm.ToolInput(tool_name="label_household_lights", tool_args=args)
        )


async def test_creating_a_dashboard(
    hass: HomeAssistant, entry, hass_admin_user: User
) -> None:
    """A wall panel's dashboard, saved with its card; then listed as using it."""
    created = await _call(
        hass,
        hass_admin_user,
        "create_dashboard",
        {
            "title": "Kitchen",
            "url_path": "dashboard-kitchen",
            "card": "wall_panel",
            "name": "Kitchen wall panel",
            "floor": "main",
            "timer": True,
        },
    )
    assert created["created"] == "/dashboard-kitchen/home"
    assert created["card"] == {
        "type": "custom:wall-panel-dashboard",
        "name": "Kitchen wall panel",
        "floor": "main",
        "timer": True,
    }
    config = (
        await hass.data["lovelace"].dashboards["dashboard-kitchen"].async_load(False)
    )
    assert config["views"][0]["cards"] == [created["card"]]

    status = await _call(hass, hass_admin_user, "integration_status")
    kitchen = next(
        d for d in status["dashboards"] if d["url_path"] == "dashboard-kitchen"
    )
    assert kitchen == {
        "url_path": "dashboard-kitchen",
        "title": "Kitchen",
        "mode": "storage",
        "custom_cards": ["custom:wall-panel-dashboard"],
    }

    api = await llm.async_get_api(hass, LLM_API_ID, _context(hass_admin_user))
    # Taken already
    with pytest.raises(HomeAssistantError):
        await api.async_call_tool(
            llm.ToolInput(
                tool_name="create_dashboard",
                tool_args={
                    "title": "Again",
                    "url_path": "dashboard-kitchen",
                    "card": "home",
                },
            )
        )
    with pytest.raises(HomeAssistantError, match="hyphen"):
        await api.async_call_tool(
            llm.ToolInput(
                tool_name="create_dashboard",
                tool_args={"title": "Home", "url_path": "home", "card": "home"},
            )
        )
    with pytest.raises(probatio.Invalid):
        await api.async_call_tool(
            llm.ToolInput(
                tool_name="create_dashboard",
                tool_args={"title": "Den", "url_path": "dashboard-den", "card": "tv"},
            )
        )


async def test_checking_house_settings(
    hass: HomeAssistant, entry, hass_admin_user: User
) -> None:
    """What the dashboards understood of a card's settings, and what they ignored."""
    checked = await _call(
        hass,
        hass_admin_user,
        "check_house_settings",
        {"yaml": "weather: weather.home\nannounce_speaker: light.oops\n"},
    )
    assert checked == {"understood": ["weather"], "ignored": ["announce_speaker"]}


async def test_through_home_assistants_mcp_server(
    hass: HomeAssistant, entry, hass_admin_user: User
) -> None:
    """An assistant connected to Home Assistant's MCP server lists and calls them."""
    from homeassistant.components.mcp_server.server import create_server  # noqa: PLC0415

    server = await create_server(hass, [LLM_API_ID], _context(hass_admin_user))
    async with create_connected_server_and_client_session(server) as session:
        tools = {tool.name: tool for tool in (await session.list_tools()).tools}
        assert tools["create_dashboard"].inputSchema["required"] == [
            "title",
            "url_path",
            "card",
        ]
        assert tools["integration_status"].annotations.readOnlyHint is True
        result = await session.call_tool(
            "check_house_settings", {"yaml": "weather: weather.home\n"}
        )
        assert not result.isError
        assert json.loads(result.content[0].text) == {
            "understood": ["weather"],
            "ignored": [],
        }


async def _call_error(
    hass: HomeAssistant, user: User, tool: str, args: dict[str, Any]
) -> str:
    api = await llm.async_get_api(hass, LLM_API_ID, _context(user))
    with pytest.raises(HomeAssistantError) as err:
        await api.async_call_tool(llm.ToolInput(tool_name=tool, tool_args=args))
    return str(err.value)


async def test_making_a_dashboard_everyones_default(
    hass: HomeAssistant, entry, hass_admin_user: User
) -> None:
    """Home Assistant's own default dashboard setting, kept with its other settings."""
    await _call(
        hass,
        hass_admin_user,
        "create_dashboard",
        {"title": "Home", "url_path": "dashboard-home", "card": "home"},
    )
    store = await frontend.async_system_store(hass)
    await store.async_set_item("core", {"other": "kept"})
    assert (await _call(hass, hass_admin_user, "integration_status"))[
        "default_dashboard"
    ] is None

    result = await _call(
        hass, hass_admin_user, "set_default_dashboard", {"url_path": "dashboard-home"}
    )
    assert result["default_dashboard"] == "dashboard-home"
    store = await frontend.async_system_store(hass)
    assert store.data["core"] == {"other": "kept", "default_panel": "dashboard-home"}
    status = await _call(hass, hass_admin_user, "integration_status")
    assert status["default_dashboard"] == "dashboard-home"

    # And back: Home Assistant's own Overview, which isn't in the dashboards list
    result = await _call(
        hass, hass_admin_user, "set_default_dashboard", {"url_path": "lovelace"}
    )
    assert result["previous"] == "dashboard-home"
    store = await frontend.async_system_store(hass)
    assert store.data["core"]["default_panel"] == "lovelace"

    error = await _call_error(
        hass, hass_admin_user, "set_default_dashboard", {"url_path": "dashboard-nope"}
    )
    assert "no dashboard" in error


async def test_setting_the_house_theme(
    hass: HomeAssistant, entry, hass_admin_user: User
) -> None:
    """One of the integration's themes, or Home Assistant's own; nothing else."""
    status = await _call(hass, hass_admin_user, "integration_status")
    assert status["house_theme"] == "raineworks"
    ids = [t["id"] for t in status["themes"]]
    assert "raineworks" in ids and "violet" in ids

    result = await _call(hass, hass_admin_user, "set_house_theme", {"theme": "violet"})
    assert result == {
        "house_theme": "violet",
        "previous": "raineworks",
        "note": result["note"],
    }
    await hass.async_block_till_done()
    assert entry.options["theme"] == "violet"
    # The entry reloaded with it: the tools are there again, and say so
    status = await _call(hass, hass_admin_user, "integration_status")
    assert status["house_theme"] == "violet"

    await _call(hass, hass_admin_user, "set_house_theme", {"theme": "keep"})
    await hass.async_block_till_done()
    assert entry.options["theme"] == ""

    error = await _call_error(
        hass, hass_admin_user, "set_house_theme", {"theme": "neon"}
    )
    assert "No theme 'neon'" in error


@pytest.fixture
def tablet(hass: HomeAssistant, entry) -> str:
    """A wall tablet: a status LED, a wake button and a restart button."""
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={("test", "tablet")},
        name="Kitchen tablet",
        manufacturer="ROAMiQ",
    )
    entities = er.async_get(hass)
    for domain, key, name, device_class in (
        ("light", "led", "LED", None),
        ("button", "wake", "Wake screen", None),
        ("button", "reload", "Reload", "restart"),
    ):
        entities.async_get_or_create(
            domain,
            "test",
            key,
            device_id=device.id,
            original_name=name,
            original_device_class=device_class,
        )
    # A smart bulb: one light and nothing else, which is no tablet
    bulb = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("test", "bulb")}, name="Bulb"
    )
    entities.async_get_or_create("light", "test", "bulb", device_id=bulb.id)
    return device.id


async def test_finding_and_adding_a_wall_panel(
    hass: HomeAssistant, entry, hass_admin_user: User, tablet: str
) -> None:
    """The tablet found, then its dashboard made and the device registered at once."""
    (found,) = (await _call(hass, hass_admin_user, "find_wall_panel_devices"))[
        "devices"
    ]
    assert found["device_id"] == tablet
    assert found["name"] == "Kitchen tablet"
    assert found["status_light"] and found["wake"] and found["reload"]
    assert found["registered"] is False

    added = await _call(
        hass,
        hass_admin_user,
        "add_wall_panel",
        {
            "name": " Kitchen wall panel ",
            "url_path": "dashboard-kitchen",
            "device_id": tablet,
            "floor": "main",
            "timer": True,
        },
    )
    assert added["dashboard"] == "/dashboard-kitchen/home"
    assert added["registered"] is True
    assert added["card"] == {
        "type": "custom:wall-panel-dashboard",
        "name": "Kitchen wall panel",
        "floor": "main",
        "timer": True,
    }
    await hass.async_block_till_done()
    (subentry,) = entry.subentries.values()
    assert subentry.title == "Kitchen wall panel"
    assert subentry.data["device_id"] == tablet
    config = (
        await hass.data["lovelace"].dashboards["dashboard-kitchen"].async_load(False)
    )
    assert config["views"][0]["cards"] == [added["card"]]

    status = await _call(hass, hass_admin_user, "integration_status")
    assert status["wall_panels"] == [
        {"name": "Kitchen wall panel", "device": "Kitchen tablet"}
    ]
    (found,) = (await _call(hass, hass_admin_user, "find_wall_panel_devices"))[
        "devices"
    ]
    assert found["registered"] is True

    # Once only, and only real devices
    error = await _call_error(
        hass,
        hass_admin_user,
        "add_wall_panel",
        {"name": "Again", "url_path": "dashboard-again", "device_id": tablet},
    )
    assert "already" in error
    error = await _call_error(
        hass,
        hass_admin_user,
        "add_wall_panel",
        {"name": "Ghost", "url_path": "dashboard-ghost", "device_id": "nope"},
    )
    assert "No device" in error


async def test_a_wall_panel_without_a_device(
    hass: HomeAssistant, entry, hass_admin_user: User
) -> None:
    """A plain tablet: its dashboard, and nothing registered."""
    added = await _call(
        hass,
        hass_admin_user,
        "add_wall_panel",
        {"name": "Hall tablet", "url_path": "dashboard-hall"},
    )
    assert added["registered"] is False
    assert added["hardware"] is None
    assert not entry.subentries
    assert "dashboard-hall" in hass.data["lovelace"].dashboards
