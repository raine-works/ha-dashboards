"""The setup tools' module detection and house settings are the dashboards' own.

tests/fixtures/modules.json holds made-up houses with what the TypeScript
(lib/modules.ts, lib/house-config.ts) makes of them; `bun scripts/modules-fixture.ts`
writes it, and modules-fixture.test.ts fails when it's stale.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from custom_components.raineworks_dashboards.modules import (
    check_house_settings,
    load_module_words,
    merge_house_sources,
    module_states,
    parse_house_config,
)

FIXTURE = json.loads((Path(__file__).parent / "fixtures/modules.json").read_text())
IDS = [module["id"] for module in load_module_words()]


@pytest.mark.parametrize("house", FIXTURE["houses"], ids=lambda h: h["name"])
def test_each_module_is_detected_as_the_dashboards_detect_it(house: dict) -> None:
    """Every module's state, in every made-up house, is the TypeScript's."""
    settings = parse_house_config(house["house"])
    assert module_states(house["hass"], settings, IDS) == house["states"]


@pytest.mark.parametrize(
    "case", FIXTURE["settings"], ids=lambda c: json.dumps(c["raw"])[:40]
)
def test_house_settings_parse_as_the_dashboards_parse_them(case: dict) -> None:
    """The parsed settings, and which were understood, are the TypeScript's."""
    assert parse_house_config(case["raw"]) == case["parsed"]
    assert check_house_settings(case["raw"] or {}) == case["check"]


def test_every_module_has_its_words() -> None:
    """modules.json names each module once, with what it shows and needs."""
    words = load_module_words()
    assert len({w["id"] for w in words}) == len(words)
    for word in words:
        assert word["name"] and word["description"] and len(word["needs"]) > 5


def test_yaml_booleans_turn_modules_off() -> None:
    """Home Assistant reads a card's YAML before the dashboards do: `no` is false."""
    raw = yaml.safe_load("modules:\n  holidays: no\n  music: 'no'\n")
    assert parse_house_config(raw)["modules"] == {"holidays": False}
    states = module_states({}, parse_house_config(raw), ["holidays", "music"])
    assert states == {"holidays": "off", "music": "missing"}


def test_a_cards_settings_win_key_by_key() -> None:
    """The card's `house` option over the integration's House options."""
    merged = merge_house_sources(
        {"weather": "weather.home", "announce_speaker": "media_player.kitchen"},
        {"weather": "weather.cabin"},
    )
    assert merged == {
        "weather": "weather.cabin",
        "announce_speaker": "media_player.kitchen",
    }
    assert merge_house_sources(None, "not a mapping") == {}


def test_people_are_the_households_when_its_known() -> None:
    """With the integration's household, its members; else people with trackers."""
    hass = {
        "states": {
            "person.guest": {"entity_id": "person.guest", "attributes": {}},
            "person.alex": {
                "entity_id": "person.alex",
                "attributes": {"device_trackers": ["device_tracker.phone"]},
            },
        }
    }
    house = parse_house_config({})
    assert module_states(hass, house, ["people"]) == {"people": "on"}
    assert module_states(hass, house, ["people"], members=set()) == {
        "people": "missing"
    }
    assert module_states(hass, house, ["people"], members={"person.guest"}) == {
        "people": "on"
    }
