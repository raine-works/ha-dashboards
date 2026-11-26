"""The dashboards' modules and house settings, for the setup tools.

A port of the dashboards' own detection (packages/ui/src/lib/modules.ts and the
discovery it calls) and their house settings parser (lib/house-config.ts), so an
assistant asking Home Assistant (through its MCP server) gets the same answer the
dashboards would. Each module's words (name, what it shows, what it needs) come
from modules.json, written from the TypeScript by `bun scripts/modules-fixture.ts`;
tests/fixtures/modules.json holds made-up houses with the TypeScript's answers,
which test_modules.py holds this port to.

Everything here is pure: it reads a snapshot of the states, registries, services
and config in the frontend's shapes (``llm_api.snapshot()`` builds one), so the
same functions run on the fixture's houses and on a real Home Assistant.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
import json
from pathlib import Path
import re
from typing import Any

MODULES_FILE = Path(__file__).parent / "modules.json"

HOUSEHOLD_LIGHT_LABEL = "household_light"
BEDTIME_LABEL = "bedtime"
TV_LABEL = "household_tv"
TV_PLATFORM = "googletv"
DIFFUSER_PLATFORM = "everscent"
PRINTER_PLATFORM = "escpos_printer"
WINDOW_COVER_CLASSES = ("curtain", "blind", "shade", "shutter")
BEDTIME_STEP_KINDS = (
    "rooms",
    "lights",
    "media",
    "speaker",
    "fan",
    "covers",
    "locks",
    "climate",
    "alert",
    "panels",
)

_ENTITY_ID = re.compile(r"[a-z_]+\.[a-z0-9_]+")

type Snapshot = Mapping[str, Any]
"""States, registries, services and config as the frontend has them (``hass``):
``states`` (entity id → ``{entity_id, state, attributes}``), ``entities`` (the
entity registry's display entries: ``platform``, ``labels``, ``hidden``,
``area_id``, ``device_id``), ``devices``, ``areas``, ``services`` (domain →
service → …) and ``config`` (``components``)."""


def load_module_words() -> list[dict[str, str]]:
    """Each module's id, name, description and needs, in the report's order.

    Reads modules.json: run it in the executor.
    """
    return json.loads(MODULES_FILE.read_text())


# The house settings ----------------------------------------------------------


def _text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _entity_of(value: Any, domain: str | None = None) -> str | None:
    entity_id = _text(value)
    if not entity_id or not _ENTITY_ID.fullmatch(entity_id):
        return None
    return entity_id if not domain or entity_id.startswith(f"{domain}.") else None


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _without_none(value: dict[str, Any]) -> dict[str, Any]:
    """Unset values left out, as JSON writes the TypeScript's ``undefined``."""
    return {key: item for key, item in value.items() if item is not None}


def _appliance(value: Any, name: str) -> dict[str, str] | None:
    if not isinstance(value, Mapping):
        return None
    machine = _entity_of(value.get("machine_state"), "sensor")
    job = _entity_of(value.get("job_state"), "sensor")
    remaining = _entity_of(value.get("time_remaining"), "sensor")
    if not machine or not job or not remaining:
        return None
    return {
        "name": _text(value.get("name")) or name,
        "machineState": machine,
        "jobState": job,
        "timeRemaining": remaining,
    }


def _routine(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, Mapping) or not (zone := _text(value.get("zone"))):
        return None
    steps = []
    for step in _list(value.get("steps")):
        if not isinstance(step, Mapping):
            continue
        kind = _text(step.get("kind"))
        line = _text(step.get("text"))
        # An unknown kind would have no icon
        if kind not in BEDTIME_STEP_KINDS or not line:
            continue
        actions = [a for a in _list(step.get("actions")) if isinstance(a, str)]
        steps.append({"kind": kind, "text": line, "actions": actions})
    return {"zone": zone, "steps": steps}


def parse_house_config(raw: Any) -> dict[str, Any]:
    """A card's ``house`` option (or the integration's House options) as settings.

    The dashboards' ``parseHouseConfig()``, with the same keys (camelCase, as the
    dashboards use them). Anything missing or of the wrong shape is left out,
    never an error: a typo costs one feature, not the dashboard.
    """
    config = _mapping(raw)
    tts = _mapping(config.get("tts"))
    laundry = _mapping(config.get("laundry"))
    thermostats = []
    for zone in _list(config.get("thermostats")):
        entity_id = _entity_of(
            zone.get("entity") if isinstance(zone, Mapping) else zone, "climate"
        )
        if entity_id:
            name = _text(zone.get("name")) if isinstance(zone, Mapping) else None
            thermostats.append(_without_none({"entityId": entity_id, "name": name}))
    routines = {}
    for toggle, value in _mapping(config.get("bedtime_routines")).items():
        is_toggle = _entity_of(toggle, "switch") or _entity_of(toggle, "input_boolean")
        if is_toggle and (parsed := _routine(value)):
            routines[toggle] = parsed
    live_inputs = []
    for item in _list(config.get("live_inputs")):
        if not isinstance(item, Mapping):
            continue
        name, uri = _text(item.get("name")), _text(item.get("uri"))
        if name and uri:
            signal = _entity_of(item.get("signal"), "binary_sensor")
            live_inputs.append(
                _without_none({"name": name, "uri": uri, "signal": signal})
            )
    modules = {
        key: value
        for key, value in _mapping(config.get("modules")).items()
        # bool only: YAML's 'no' is already False, a quoted "no" isn't a setting
        if isinstance(value, bool)
    }
    return _without_none(
        {
            "announceSpeaker": _entity_of(
                config.get("announce_speaker"), "media_player"
            ),
            "weather": _entity_of(config.get("weather"), "weather"),
            "alarmPanel": _entity_of(config.get("alarm_panel"), "alarm_control_panel"),
            "thermostats": thermostats or None,
            "laundry": _without_none(
                {
                    "washer": _appliance(laundry.get("washer"), "Washer"),
                    "dryer": _appliance(laundry.get("dryer"), "Dryer"),
                }
            ),
            "guestWifiQr": _entity_of(config.get("guest_wifi_qr"), "image"),
            "liveInputs": live_inputs,
            "tts": _without_none(
                {
                    "engine": _entity_of(tts.get("engine"), "tts"),
                    "voice": _text(tts.get("voice")),
                    "streaming": tts.get("streaming") is True,
                    "fallback": _entity_of(tts.get("fallback"), "tts"),
                }
            ),
            "birthdayCalendar": _entity_of(config.get("birthday_calendar"), "calendar"),
            "bedtimeRoutines": routines,
            "modules": modules,
        }
    )


def merge_house_sources(integration: Any, card: Any) -> dict[str, Any]:
    """The integration's settings with a card's over them, key by key."""
    return {**_mapping(integration), **_mapping(card)}


def check_house_settings(raw: Any) -> dict[str, list[str]]:
    """Which keys of a ``house`` setting the dashboards understood, and which not.

    A value of the wrong shape is ignored without an error, so this is how to
    check settings before relying on them.
    """
    if not isinstance(raw, Mapping):
        return {"understood": [], "ignored": ["(not a mapping)"]}
    house = parse_house_config(raw)

    def count(value: Any) -> int:
        return len(value) if isinstance(value, (list, Mapping)) else 0

    laundry = house["laundry"]
    tts = house["tts"]
    used = {
        "announce_speaker": "announceSpeaker" in house,
        "weather": "weather" in house,
        "alarm_panel": "alarmPanel" in house,
        "thermostats": len(house.get("thermostats", []))
        == count(raw.get("thermostats"))
        and count(raw.get("thermostats")) > 0,
        "laundry": "washer" in laundry or "dryer" in laundry,
        "guest_wifi_qr": "guestWifiQr" in house,
        "live_inputs": len(house["liveInputs"]) == count(raw.get("live_inputs"))
        and count(raw.get("live_inputs")) > 0,
        "tts": "engine" in tts or "voice" in tts,
        "birthday_calendar": "birthdayCalendar" in house,
        "bedtime_routines": len(house["bedtimeRoutines"])
        == count(raw.get("bedtime_routines")),
        "modules": len(house["modules"]) == count(raw.get("modules")),
    }
    keys = [key for key, value in raw.items() if value is not None]
    return {
        "understood": [key for key in keys if used.get(key)],
        "ignored": [key for key in keys if not used.get(key)],
    }


# Detection -------------------------------------------------------------------


def _states(hass: Snapshot) -> Mapping[str, Mapping[str, Any]]:
    return hass.get("states") or {}


def _attrs(state: Mapping[str, Any]) -> Mapping[str, Any]:
    return state.get("attributes") or {}


def _registry(hass: Snapshot) -> Mapping[str, Mapping[str, Any]]:
    return hass.get("entities") or {}


def _has_domain(hass: Snapshot, domain: str) -> bool:
    return any(entity_id.startswith(f"{domain}.") for entity_id in _states(hass))


def _has_service(hass: Snapshot, domain: str, service: str | None = None) -> bool:
    # Present is enough, even with no fields: the TypeScript's `!!{}` is true
    services = (hass.get("services") or {}).get(domain)
    return services is not None and (not service or services.get(service) is not None)


def _hidden(hass: Snapshot, entity_id: str) -> bool:
    return bool(_registry(hass).get(entity_id, {}).get("hidden"))


def _entity_area(hass: Snapshot, entity_id: str) -> str | None:
    entry = _registry(hass).get(entity_id) or {}
    if entry.get("area_id"):
        return entry["area_id"]
    device = (hass.get("devices") or {}).get(entry.get("device_id") or "") or {}
    return device.get("area_id") or None


def _labels(entry: Mapping[str, Any]) -> Iterable[str]:
    return entry.get("labels") or ()


def _bedtime_toggles(hass: Snapshot) -> dict[str, str]:
    by_area: dict[str, str] = {}
    for entry in _registry(hass).values():
        entity_id = entry["entity_id"]
        is_switch = entity_id.startswith("switch.")
        if not (is_switch or entity_id.startswith("input_boolean.")):
            continue
        if entry.get("hidden") or BEDTIME_LABEL not in _labels(entry):
            continue
        if not (area_id := _entity_area(hass, entity_id)):
            continue
        # A switch (the integration's) wins where an area has both
        if area_id not in by_area or (
            is_switch and not by_area[area_id].startswith("switch.")
        ):
            by_area[area_id] = entity_id
    return by_area


def _alarm_panel(hass: Snapshot, configured: str | None) -> str | None:
    if configured:
        return configured
    panels = sorted(i for i in _states(hass) if i.startswith("alarm_control_panel."))
    alarmo = [
        p for p in panels if _registry(hass).get(p, {}).get("platform") == "alarmo"
    ]
    return (alarmo or panels or [None])[0]


def _window_covers(hass: Snapshot) -> list[str]:
    covers = [
        state
        for entity_id, state in _states(hass).items()
        if entity_id.startswith("cover.")
        and _attrs(state).get("device_class") in WINDOW_COVER_CLASSES
        and not _hidden(hass, entity_id)
    ]
    # A cover group stands for its motors
    in_groups = {
        member
        for state in covers
        if isinstance(members := _attrs(state).get("entity_id"), list)
        for member in members
        if isinstance(member, str)
    }
    return [s["entity_id"] for s in covers if s["entity_id"] not in in_groups]


def _fans(hass: Snapshot) -> list[str]:
    return [
        entity_id
        for entity_id in _states(hass)
        if entity_id.startswith("fan.") and not _hidden(hass, entity_id)
    ]


def _diffusers(hass: Snapshot) -> list[str]:
    return [
        entity_id
        for entity_id in _states(hass)
        if entity_id.startswith("switch.")
        and entity_id.endswith("_power")
        and _registry(hass).get(entity_id, {}).get("platform") == DIFFUSER_PLATFORM
        and not _hidden(hass, entity_id)
    ]


def _has_tracker(state: Mapping[str, Any]) -> bool:
    trackers = _attrs(state).get("device_trackers")
    return isinstance(trackers, list) and len(trackers) > 0


def _people(hass: Snapshot, members: set[str] | None) -> list[str]:
    return [
        entity_id
        for entity_id, state in _states(hass).items()
        if entity_id.startswith("person.")
        and (entity_id in members if members is not None else _has_tracker(state))
    ]


def _pets(hass: Snapshot) -> list[str]:
    states = _states(hass)
    return [
        entity_id
        for entity_id, state in states.items()
        if entity_id.startswith("person.")
        and not _has_tracker(state)
        and (
            f"sensor.{entity_id[7:]}_visits_today" in states
            or f"sensor.{entity_id[7:]}_weight" in states
        )
    ]


def _music(hass: Snapshot) -> bool:
    return any(
        _attrs(state).get("mass_player_type") is not None
        for state in _states(hass).values()
    )


def _tvs(hass: Snapshot) -> list[str]:
    registry = hass.get("entities")
    labeled = bool(registry) and any(
        TV_LABEL in _labels(entry) for entry in registry.values()
    )
    found = []
    for entity_id, state in _states(hass).items():
        attrs = _attrs(state)
        if (
            not entity_id.startswith("media_player.")
            or attrs.get("device_class") != "tv"
        ):
            continue
        if attrs.get("mass_player_type") is not None:
            continue
        # Without the registry (never on a real Home Assistant), by device class alone
        if registry is None:
            found.append(entity_id)
            continue
        entry = registry.get(entity_id) or {}
        if labeled and TV_LABEL not in _labels(entry):
            continue
        if entry.get("platform") == TV_PLATFORM and not entry.get("hidden"):
            found.append(entity_id)
    return found


def _printers(hass: Snapshot) -> list[str]:
    return [
        entry["entity_id"]
        for entry in _registry(hass).values()
        if entry["entity_id"].startswith("notify.")
        and entry.get("platform") == PRINTER_PLATFORM
        and not entry.get("hidden")
    ]


type Detect = Callable[[Snapshot, dict[str, Any], set[str] | None], bool]


def _laundry(hass: Snapshot, house: dict[str, Any]) -> bool:
    machines = [house["laundry"].get("washer"), house["laundry"].get("dryer")]
    return any(m and m["machineState"] in _states(hass) for m in machines)


def _weather(hass: Snapshot, house: dict[str, Any]) -> bool:
    if "weather" in house:
        return house["weather"] in _states(hass)
    return _has_domain(hass, "weather")


def _assist(hass: Snapshot) -> bool:
    # Without the list (never on a real Home Assistant), assumed there
    components = (hass.get("config") or {}).get("components")
    return components is None or "assist_pipeline" in components


_DETECT: dict[str, Detect] = {
    "lighting": lambda h, _, __: any(
        HOUSEHOLD_LIGHT_LABEL in _labels(e) for e in _registry(h).values()
    ),
    "bedtime": lambda h, _, __: bool(_bedtime_toggles(h)),
    "security": lambda h, _, __: _has_domain(h, "lock") or _has_domain(h, "cover"),
    "alarm": lambda h, house, _: (
        bool(_alarm_panel(h, house.get("alarmPanel"))) and _has_service(h, "alarmo")
    ),
    "cameras": lambda h, _, __: _has_domain(h, "camera"),
    "climate": lambda h, house, _: (
        bool(house.get("thermostats")) or _has_domain(h, "climate")
    ),
    "thermostat_presets": lambda h, _, __: (
        "input_select.thermostat_preset" in _states(h)
    ),
    "covers": lambda h, _, __: bool(_window_covers(h)),
    "fans": lambda h, _, __: bool(_fans(h)),
    "diffusers": lambda h, _, __: bool(_diffusers(h)),
    "weather": lambda h, house, _: _weather(h, house),
    "calendar": lambda h, _, __: _has_domain(h, "calendar"),
    "todo": lambda h, _, __: _has_domain(h, "todo"),
    "people": lambda h, _, members: bool(_people(h, members)),
    "pets": lambda h, _, __: bool(_pets(h)),
    "music": lambda h, _, __: _music(h),
    "tvs": lambda h, _, __: bool(_tvs(h)),
    "messages": lambda h, _, __: (
        _music(h) or _has_service(h, "script", "notify_people") or bool(_printers(h))
    ),
    "printer": lambda h, _, __: bool(_printers(h)),
    "laundry": lambda h, house, _: _laundry(h, house),
    "daily": lambda h, _, __: (
        "sensor.daily_brief" in _states(h)
        and _has_service(h, "script", "daily_brief_generate")
    ),
    "assist": lambda h, _, __: _assist(h),
    "guest_wifi": lambda h, house, _: (
        "guestWifiQr" in house and house["guestWifiQr"] in _states(h)
    ),
}
"""How each module is detected. A module without an entry (energy,
notifications, holidays) finds what it needs as it's shown, so it counts as there."""


def module_states(
    hass: Snapshot,
    house: dict[str, Any],
    ids: Iterable[str],
    members: set[str] | None = None,
) -> dict[str, str]:
    """Each module's state in this house: ``on``, ``missing`` or ``off``.

    ``house`` is parsed settings (``parse_house_config``); a module turned off
    there is ``off`` whatever it finds. ``members`` is the household's person
    entity ids, when known (the integration's household); without it, as in the
    dashboards before they've asked, every person with a device tracker.
    """
    turned_off = house.get("modules", {})
    result = {}
    for module_id in ids:
        if turned_off.get(module_id) is False:
            result[module_id] = "off"
            continue
        detect = _DETECT.get(module_id)
        on = detect is None or detect(hass, house, members)
        result[module_id] = "on" if on else "missing"
    return result
