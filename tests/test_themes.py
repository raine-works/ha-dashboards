"""The dashboards' themes in Home Assistant's list, the house theme, custom themes."""

from homeassistant.components.frontend import DATA_THEMES
from homeassistant.const import EVENT_THEMES_UPDATED
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.raineworks_dashboards.themes import (
    CONF_THEME,
    DATA_DEFAULT_DARK_THEME,
    DATA_DEFAULT_THEME,
    KEEP_HA_THEME,
)

HA = {
    "modes": {
        "light": {"primary-color": "#111111"},
        "dark": {"primary-color": "#eeeeee"},
    }
}


async def _frontend(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "frontend", {})


async def test_registers_the_presets_and_makes_the_house_theme_the_default(
    hass: HomeAssistant, setup
) -> None:
    await _frontend(hass)
    await setup()
    themes = hass.data[DATA_THEMES]
    assert {"Raineworks", "Raineworks Neutral", "Raineworks Blue"} <= set(themes)
    assert themes["Raineworks"]["modes"]["dark"]["primary-background-color"].startswith(
        "#"
    )
    assert hass.data[DATA_DEFAULT_THEME] == "Raineworks"
    assert hass.data[DATA_DEFAULT_DARK_THEME] == "Raineworks"


async def test_leaves_home_assistants_theme_when_told(
    hass: HomeAssistant, setup
) -> None:
    await _frontend(hass)
    await setup({CONF_THEME: KEEP_HA_THEME})
    assert "Raineworks" in hass.data[DATA_THEMES]
    assert hass.data[DATA_DEFAULT_THEME] == "default"


async def test_registers_again_after_a_reload_of_yaml_themes(
    hass: HomeAssistant, setup
) -> None:
    await _frontend(hass)
    await setup()
    # As frontend.reload_themes does: a new dict of the YAML themes, then the event
    hass.data[DATA_THEMES] = {"Mine": {"primary-color": "#123456"}}
    hass.bus.async_fire(EVENT_THEMES_UPDATED)
    await hass.async_block_till_done()
    assert {"Mine", "Raineworks"} <= set(hass.data[DATA_THEMES])


async def test_custom_themes_are_their_owners_or_the_houses(
    hass: HomeAssistant, setup, hass_ws_client, hass_admin_user
) -> None:
    await _frontend(hass)
    await setup()
    client = await hass_ws_client(hass)
    updated = async_capture_events(hass, EVENT_THEMES_UPDATED)

    await client.send_json_auto_id(
        {
            "type": "raineworks_dashboards/themes/save",
            "theme": {"name": "Sunset"},
            "ha": HA,
        }
    )
    mine = (await client.receive_json())["result"]
    assert mine["mine"] and not mine["shared"] and mine["ha_name"] == "Sunset"
    assert hass.data[DATA_THEMES]["Sunset"] == HA
    assert updated

    # Not a theme
    await client.send_json_auto_id(
        {
            "type": "raineworks_dashboards/themes/save",
            "theme": {"name": "Bad"},
            "ha": {"modes": {"x": {}}},
        }
    )
    assert (await client.receive_json())["error"]["code"] == "invalid"

    await client.send_json_auto_id({"type": "raineworks_dashboards/themes"})
    listed = (await client.receive_json())["result"]
    assert listed["house"] == "raineworks"
    assert [t["name"] for t in listed["themes"] if t["custom"]] == ["Sunset"]

    # A non-admin can't share with the house
    hass_admin_user.groups = []
    await client.send_json_auto_id(
        {
            "type": "raineworks_dashboards/themes/save",
            "theme": {"name": "House"},
            "ha": HA,
            "shared": True,
        }
    )
    assert (await client.receive_json())["error"]["code"] == "unauthorized"

    await client.send_json_auto_id(
        {"type": "raineworks_dashboards/themes/delete", "theme_id": mine["id"]}
    )
    deleted = await client.receive_json()
    assert deleted["success"], deleted
    assert "Sunset" not in hass.data[DATA_THEMES]
