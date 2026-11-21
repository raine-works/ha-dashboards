"""Adding the integration and its options."""

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.raineworks_dashboards.const import (
    CONF_HOUSE,
    CONF_HOUSEHOLD_GROUP,
    CONF_SERVE_BUNDLE,
    DOMAIN,
)


async def test_adds_one_entry(hass: HomeAssistant, setup) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY

    again = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert again["type"] is FlowResultType.ABORT
    assert again["reason"] == "single_instance_allowed"


async def _open(hass: HomeAssistant, entry, step: str):
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    assert result["menu_options"] == ["general", "house", "bedtime", "laundry"]
    return await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": step}
    )


async def test_general_without_warden(hass: HomeAssistant, setup) -> None:
    entry = await setup()
    result = await _open(hass, entry, "general")
    assert CONF_HOUSEHOLD_GROUP not in result["data_schema"].schema
    await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_SERVE_BUNDLE: False}
    )
    assert entry.options[CONF_SERVE_BUNDLE] is False
    assert entry.options[CONF_HOUSEHOLD_GROUP] is None


async def test_general_picks_a_warden_group(hass: HomeAssistant, warden, setup) -> None:
    entry = await setup()
    result = await _open(hass, entry, "general")
    assert CONF_HOUSEHOLD_GROUP in result["data_schema"].schema
    await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_SERVE_BUNDLE: True, CONF_HOUSEHOLD_GROUP: "g-family"}
    )
    assert entry.options[CONF_HOUSEHOLD_GROUP] == "g-family"


async def test_house_and_laundry_keep_each_other_and_general(
    hass: HomeAssistant, hass_ws_client, setup
) -> None:
    entry = await setup({CONF_SERVE_BUNDLE: False})
    result = await _open(hass, entry, "house")
    await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "announce_speaker": "media_player.kitchen",
            "thermostats": ["climate.up", "climate.down"],
            "tts_engine": "tts.piper",
            "tts_voice": " amy ",
            "tts_streaming": False,
        },
    )
    result = await _open(hass, entry, "laundry")
    await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "washer_machine_state": "sensor.w_m",
            "washer_job_state": "sensor.w_j",
            "washer_time_remaining": "sensor.w_t",
        },
    )
    await hass.async_block_till_done()
    assert entry.options[CONF_SERVE_BUNDLE] is False
    assert entry.options[CONF_HOUSE]["announce_speaker"] == "media_player.kitchen"

    # The dashboards get them in house.yaml's shape, unset values left out
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "raineworks_dashboards/info"})
    house = (await client.receive_json())["result"]["house"]
    assert house == {
        "announce_speaker": "media_player.kitchen",
        "thermostats": ["climate.up", "climate.down"],
        "tts": {"engine": "tts.piper", "voice": "amy", "streaming": False},
        "laundry": {
            "washer": {
                "machine_state": "sensor.w_m",
                "job_state": "sensor.w_j",
                "time_remaining": "sensor.w_t",
            }
        },
    }
