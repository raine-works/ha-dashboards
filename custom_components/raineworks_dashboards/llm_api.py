"""The setup tools, for any AI assistant, through Home Assistant's MCP server.

Registers an LLM API, "Raineworks Dashboards setup", whose tools check a Home
Assistant for the dashboards and set them up: what's installed, which features
this house has and what each missing one needs, the floors, the lights to label,
a dashboard to create. Home Assistant's Model Context Protocol Server integration
serves every registered API to an assistant (Claude, ChatGPT, any MCP client) at
``/api/mcp``, so the tools come with the integration and are always its version:
nothing to install on a computer.

Every tool is for administrators: they read the registries, and two of them change
Home Assistant. A call from anyone else (a voice satellite, a non-admin's token)
is refused. The changes go through Home Assistant's own websocket commands as the
calling user, so its validation and permission checks apply as they would in its
own UI.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
import logging
import re
from typing import Any, override

from homeassistant.auth.models import User
from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.components.websocket_api.http import WebSocketAdapter
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
    floor_registry as fr,
    llm,
)
from homeassistant.loader import async_get_integration
from homeassistant.util.json import json_loads
import probatio
import yaml

from .const import CONF_HOUSE, CONF_HOUSEHOLD_GROUP, DOMAIN
from .household import household
from .modules import (
    HOUSEHOLD_LIGHT_LABEL,
    check_house_settings,
    merge_house_sources,
    module_states,
    parse_house_config,
)

_LOGGER = logging.getLogger(__name__)

LLM_API_ID = f"{DOMAIN}_setup"
LLM_API_NAME = "Raineworks Dashboards setup"
API_PROMPT = (
    "Tools to set up Raineworks Dashboards on this Home Assistant: start with "
    "integration_status, then capability_report for what this house has and what "
    "each missing feature needs. Lights show on the dashboards once labeled "
    '"Household Light" and in an area on a floor (find_unlabeled_lights, '
    "list_floors). label_household_lights and create_dashboard change Home "
    "Assistant: say what they'll do and wait for the user to agree first."
)

# A command run as the caller should answer quickly; a stuck one never blocks a tool
COMMAND_TIMEOUT_S = 30

_READ_ONLY = llm.ToolAnnotations(
    read_only=True, destructive=False, idempotent=True, open_world=False
)
# Labeling again changes nothing; a second create fails (the url_path is taken)
_LABELS = llm.ToolAnnotations(
    read_only=False, destructive=False, idempotent=True, open_world=False
)
_CREATES = llm.ToolAnnotations(
    read_only=False, destructive=False, idempotent=False, open_world=False
)

# Indicators and status LEDs are lights too, but not room lights
_INDICATOR = re.compile(r"\b(led|indicator|status|night ?light|backlight)\b", re.I)
_URL_PATH = re.compile(r"[a-z0-9]+(-[a-z0-9]+)+")
_CARD_TYPE = re.compile(r"custom:[\w-]+")


# Reading Home Assistant ------------------------------------------------------


def snapshot(hass: HomeAssistant) -> dict[str, Any]:
    """What the dashboards see of this Home Assistant, in the frontend's shapes.

    The states, the entity registry as the frontend lists it (no disabled
    entities; ``hidden`` from ``hidden_by``), devices, areas, services and the
    loaded components: what ``modules.module_states`` reads.
    """
    entities = {
        entry.entity_id: {
            "entity_id": entry.entity_id,
            "platform": entry.platform,
            "labels": sorted(entry.labels),
            "hidden": entry.hidden_by is not None,
            "area_id": entry.area_id,
            "device_id": entry.device_id,
        }
        for entry in er.async_get(hass).entities.values()
        if entry.disabled_by is None
    }
    return {
        "states": {
            state.entity_id: {
                "entity_id": state.entity_id,
                "state": state.state,
                "attributes": state.attributes,
            }
            for state in hass.states.async_all()
        },
        "entities": entities,
        "devices": {
            device.id: {"id": device.id, "area_id": device.area_id}
            for device in dr.async_get(hass).devices.values()
        },
        "areas": {
            area.id: {"area_id": area.id, "name": area.name, "floor_id": area.floor_id}
            for area in ar.async_get(hass).async_list_areas()
        },
        "services": {
            domain: {service: {} for service in services}
            for domain, services in hass.services.async_services().items()
        },
        "config": {"components": sorted(hass.config.components)},
    }


def _options(hass: HomeAssistant) -> dict[str, Any]:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    return dict(entries[0].options) if entries else {}


def _household(hass: HomeAssistant) -> list[str]:
    people, _source = household(hass, _options(hass).get(CONF_HOUSEHOLD_GROUP))
    return people


def _yaml(text: str | None) -> Any:
    """A card's settings, written by an assistant, as plain data.

    PyYAML's SafeLoader, never Home Assistant's config loader: that one honours
    `!include`, `!env_var` and `!secret`, which would read files (in the event
    loop) and the environment for text a model wrote. SafeLoader knows none of
    them, and still reads `no` as false, as Home Assistant reads a card's YAML.

    Raises:
        HomeAssistantError: It isn't YAML, or uses a tag (refused, not followed).
    """
    if not text or not text.strip():
        return None
    try:
        return yaml.load(text, Loader=yaml.SafeLoader)
    except yaml.YAMLError as err:
        # The parser's own message: the assistant's text, never a file's
        raise HomeAssistantError(f"That isn't valid YAML: {err}") from err


def unlabeled_lights(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Lights people could switch (not hidden or disabled) without the label."""
    entities = er.async_get(hass)
    devices = dr.async_get(hass)
    areas = ar.async_get(hass)
    found = []
    for entry in entities.entities.values():
        if entry.domain != "light" or entry.hidden_by or entry.disabled_by:
            continue
        if HOUSEHOLD_LIGHT_LABEL in entry.labels:
            continue
        device = devices.async_get(entry.device_id) if entry.device_id else None
        area_id = entry.area_id or (device.area_id if device else None)
        area = areas.async_get_area(area_id) if area_id else None
        state = hass.states.get(entry.entity_id)
        name = (
            (state.attributes.get("friendly_name") if state else None)
            or entry.name
            or entry.original_name
            or entry.entity_id
        )
        model = device.model if device else None
        found.append(
            {
                "entity_id": entry.entity_id,
                "name": name,
                "area": area.name if area else None,
                "floor": area.floor_id if area else None,
                "device": (device.name_by_user or device.name) if device else None,
                "model": model,
                "looks_like_an_indicator": bool(
                    _INDICATOR.search(f"{name} {model or ''}")
                ),
            }
        )
    return sorted(
        found, key=lambda light: (light["area"] or "~", light["name"].casefold())
    )


def dashboard_config(card: dict[str, Any]) -> dict[str, Any]:
    """A dashboard's whole config: one panel view hosting the card."""
    return {
        "views": [{"title": "Home", "path": "home", "panel": True, "cards": [card]}]
    }


def _card_types(config: Any) -> list[str]:
    """The custom cards a dashboard's config uses."""
    return sorted(set(_CARD_TYPE.findall(repr(config))))


# Running Home Assistant's own commands as the caller -------------------------


async def run_command(hass: HomeAssistant, user: User, msg: dict[str, Any]) -> Any:
    """Run a websocket command as ``user`` and return its result.

    The same commands Home Assistant's own UI sends, so they validate and check
    permissions as they would there.

    Raises:
        HomeAssistantError: The command failed (its message), or took too long.
    """
    done: asyncio.Future[Any] = hass.loop.create_future()

    @callback
    def receive(message: bytes | str | dict[str, Any]) -> None:
        reply = message if isinstance(message, dict) else json_loads(message)
        if done.done() or not isinstance(reply, dict) or reply.get("id") != 1:
            return
        if reply.get("success"):
            done.set_result(reply.get("result"))
        else:
            error = reply.get("error") or {}
            done.set_exception(HomeAssistantError(error.get("message", "It failed")))

    connection = ActiveConnection(
        WebSocketAdapter(_LOGGER, {"connid": LLM_API_ID}),
        hass,
        receive,
        user,
        None,
        None,
    )
    connection.async_handle({"id": 1, **msg})
    try:
        async with asyncio.timeout(COMMAND_TIMEOUT_S):
            return await done
    except TimeoutError as err:
        raise HomeAssistantError(f"{msg['type']} took too long") from err


# The tools -------------------------------------------------------------------

type Run = Callable[[HomeAssistant, User, dict[str, Any]], Awaitable[Any]]


@dataclass(frozen=True, kw_only=True)
class _Spec:
    name: str
    title: str
    description: str
    run: Run
    annotations: llm.ToolAnnotations
    parameters: dict[Any, Any] = field(default_factory=dict)


async def _integration_status(hass: HomeAssistant, user: User, _: dict) -> Any:
    integration = await async_get_integration(hass, DOMAIN)
    entries = hass.config_entries.async_entries(DOMAIN)
    dashboards = []
    for dashboard in await run_command(
        hass, user, {"type": "lovelace/dashboards/list"}
    ):
        cards = None
        if dashboard.get("mode") == "storage":
            try:
                config = await run_command(
                    hass,
                    user,
                    {"type": "lovelace/config", "url_path": dashboard["url_path"]},
                )
                cards = _card_types(config)
            except HomeAssistantError:
                cards = []  # Never saved: nothing on it yet
        dashboards.append(
            {
                "url_path": dashboard["url_path"],
                "title": dashboard.get("title"),
                "mode": dashboard.get("mode"),
                "custom_cards": cards,
            }
        )
    return {
        "version": str(integration.version),
        "state": entries[0].state.value if entries else "not set up",
        "household": _household(hass),
        "house_settings": _options(hass).get(CONF_HOUSE) or {},
        "dashboards": dashboards,
        "cards": {
            "custom:home-dashboard": "Desktops and phones",
            "custom:wall-panel-dashboard": "A wall tablet (name, floor, timer)",
        },
    }


async def _capability_report(
    hass: HomeAssistant, user: User, args: dict[str, Any]
) -> Any:
    words = hass.data[LLM_API_ID]
    house = parse_house_config(
        merge_house_sources(
            _options(hass).get(CONF_HOUSE), _yaml(args.get("house_yaml"))
        )
    )
    states = module_states(
        snapshot(hass), house, [w["id"] for w in words], set(_household(hass))
    )
    return {
        "on": [w["name"] for w in words if states[w["id"]] == "on"],
        "missing": [
            {"module": w["name"], "needs": w["needs"]}
            for w in words
            if states[w["id"]] == "missing"
        ],
        "off": [w["name"] for w in words if states[w["id"]] == "off"],
    }


async def _list_floors(hass: HomeAssistant, user: User, _: dict) -> Any:
    areas = ar.async_get(hass).async_list_areas()
    return {
        "floors": [
            {
                "floor_id": floor.floor_id,
                "name": floor.name,
                "level": floor.level,
                "areas": [a.name for a in areas if a.floor_id == floor.floor_id],
            }
            for floor in fr.async_get(hass).async_list_floors()
        ],
        "areas_without_a_floor": [a.name for a in areas if not a.floor_id],
    }


async def _find_unlabeled_lights(hass: HomeAssistant, user: User, _: dict) -> Any:
    return {"lights": unlabeled_lights(hass)}


async def _label_household_lights(
    hass: HomeAssistant, user: User, args: dict[str, Any]
) -> Any:
    ids: list[str] = args["entity_ids"]
    if not ids or any(not i.startswith("light.") for i in ids):
        raise HomeAssistantError("entity_ids must be light.* entity ids")
    labels = await run_command(hass, user, {"type": "config/label_registry/list"})
    if not any(label["label_id"] == HOUSEHOLD_LIGHT_LABEL for label in labels):
        await run_command(
            hass,
            user,
            {
                "type": "config/label_registry/create",
                "name": "Household Light",
                "icon": "mdi:lightbulb",
            },
        )
    labeled = []
    for entity_id in dict.fromkeys(ids):
        entry = await run_command(
            hass, user, {"type": "config/entity_registry/get", "entity_id": entity_id}
        )
        current = entry.get("labels") or []
        if HOUSEHOLD_LIGHT_LABEL not in current:
            await run_command(
                hass,
                user,
                {
                    "type": "config/entity_registry/update",
                    "entity_id": entity_id,
                    "labels": [*current, HOUSEHOLD_LIGHT_LABEL],
                },
            )
            labeled.append(entity_id)
    return {
        "labeled": labeled,
        "already_labeled": [i for i in dict.fromkeys(ids) if i not in labeled],
    }


async def _create_dashboard(
    hass: HomeAssistant, user: User, args: dict[str, Any]
) -> Any:
    url_path = args["url_path"]
    if not _URL_PATH.fullmatch(url_path):
        raise HomeAssistantError(
            "url_path must be lowercase words joined by hyphens, "
            "with at least one hyphen"
        )
    wall_panel = args["card"] == "wall_panel"
    card: dict[str, Any] = {
        "type": "custom:wall-panel-dashboard" if wall_panel else "custom:home-dashboard"
    }
    if wall_panel:
        card |= {k: args[k] for k in ("name", "floor") if args.get(k)}
        if args.get("timer"):
            card["timer"] = True
    await run_command(
        hass,
        user,
        {
            "type": "lovelace/dashboards/create",
            "url_path": url_path,
            "title": args["title"],
            "mode": "storage",
            "icon": "mdi:tablet" if wall_panel else "mdi:home",
            "show_in_sidebar": True,
            "require_admin": False,
        },
    )
    await run_command(
        hass,
        user,
        {
            "type": "lovelace/config/save",
            "url_path": url_path,
            "config": dashboard_config(card),
        },
    )
    return {
        "created": f"/{url_path}/home",
        "card": card,
        "next": (
            "Point the tablet at this dashboard, then add it on the integration's "
            "page (Add wall panel) for its status light and wake."
            if wall_panel
            else None
        ),
    }


async def _check_house_settings(
    hass: HomeAssistant, user: User, args: dict[str, Any]
) -> Any:
    return check_house_settings(_yaml(args["yaml"]) or {})


_HOUSE_YAML = probatio.Optional(
    "house_yaml", description="A card's `house` settings, as YAML"
)

SPECS: tuple[_Spec, ...] = (
    _Spec(
        name="integration_status",
        title="Integration status",
        description=(
            "The Raineworks Dashboards integration's version and state, the household "
            "it found, its house settings, and each dashboard with the custom cards it "
            "uses. Start here."
        ),
        run=_integration_status,
        annotations=_READ_ONLY,
    ),
    _Spec(
        name="capability_report",
        title="Capability report",
        description=(
            "Which dashboard features (modules) this Home Assistant has, which are "
            "missing and what each missing one needs, and which the house settings "
            "turn off. Uses the integration's house settings; pass house_yaml to add "
            "a card's own (they win key by key)."
        ),
        run=_capability_report,
        annotations=_READ_ONLY,
        parameters={_HOUSE_YAML: str},
    ),
    _Spec(
        name="list_floors",
        title="Floors and areas",
        description=(
            "The floors and their areas, for a wall panel's `floor` option and for "
            "checking every room's lights are in an area on a floor."
        ),
        run=_list_floors,
        annotations=_READ_ONLY,
    ),
    _Spec(
        name="find_unlabeled_lights",
        title="Unlabeled lights",
        description=(
            'Lights without the "Household Light" label, which the lighting section '
            "lists by floor and room. Room lights (lamps, ceiling lights, light "
            "switches) should get it; indicators, status LEDs and panel lights should "
            "not (looks_like_an_indicator flags likely ones). Ask the user before "
            "labeling."
        ),
        run=_find_unlabeled_lights,
        annotations=_READ_ONLY,
    ),
    _Spec(
        name="label_household_lights",
        title="Label household lights",
        description=(
            'Gives these lights the "Household Light" label (creating the label if '
            "needed), so the dashboards list them. Changes Home Assistant: confirm the "
            "list with the user first."
        ),
        run=_label_household_lights,
        annotations=_LABELS,
        parameters={
            probatio.Required("entity_ids", description="light.* entity ids"): [str]
        },
    ),
    _Spec(
        name="create_dashboard",
        title="Create a dashboard",
        description=(
            'Creates a dashboard hosting one of the cards: "home" (desktops and '
            'phones) or "wall_panel" (a wall tablet, with its name, floor and '
            "optional timer). Changes Home Assistant: confirm with the user first."
        ),
        run=_create_dashboard,
        annotations=_CREATES,
        parameters={
            probatio.Required("title", description="Its name in the sidebar"): str,
            probatio.Required(
                "url_path", description="Its URL, with a hyphen (dashboard-kitchen)"
            ): str,
            probatio.Required("card", description="Which card"): probatio.In(
                ["home", "wall_panel"]
            ),
            probatio.Optional(
                "name", description='wall_panel: its name ("Kitchen wall panel")'
            ): str,
            probatio.Optional(
                "floor", description="wall_panel: a floor_id from list_floors"
            ): str,
            probatio.Optional(
                "timer", description="wall_panel: a countdown timer in the header"
            ): bool,
        },
    ),
    _Spec(
        name="check_house_settings",
        title="Check house settings",
        description=(
            "Which keys of a card's `house` settings (YAML) the dashboards understood. "
            "A value of the wrong shape is ignored without an error, so check settings "
            "this way before relying on them."
        ),
        run=_check_house_settings,
        annotations=_READ_ONLY,
        parameters={
            probatio.Required("yaml", description="The house settings, as YAML"): str
        },
    ),
)


class SetupTool(llm.Tool):
    """One setup tool: for administrators only, arguments validated first."""

    def __init__(self, spec: _Spec) -> None:
        """Take the tool's name, words, schema and behaviour from its spec."""
        self.name = spec.name
        self.title = spec.title
        self.description = spec.description
        self.parameters = probatio.Schema(spec.parameters)
        self.annotations = spec.annotations
        self.integration = DOMAIN
        self._run = spec.run

    @override
    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: llm.LLMContext,
    ) -> llm.ToolResult:
        """Check the caller is an administrator, then run the tool.

        Raises:
            HomeAssistantError: The caller isn't an administrator, or the tool
                failed (its message says why).
            probatio.Invalid: The arguments don't fit the tool's schema.
        """
        user_id = llm_context.context.user_id if llm_context.context else None
        user = await hass.auth.async_get_user(user_id) if user_id else None
        if user is None or not user.is_admin:
            raise HomeAssistantError(
                "The Raineworks Dashboards setup tools are for administrators"
            )
        args = self.parameters(tool_input.tool_args)
        return llm.ToolResult(data=await self._run(hass, user, args))


@dataclass(kw_only=True)
class SetupAPI(llm.API):
    """The setup tools, as one LLM API."""

    _tools: list[llm.Tool] = field(init=False)

    def __post_init__(self) -> None:
        """Build the tools once: nothing about them depends on the request."""
        self._tools = [SetupTool(spec) for spec in SPECS]

    @override
    async def async_get_api_instance(
        self, llm_context: llm.LLMContext
    ) -> llm.APIInstance:
        """The tools and the prompt that says how to use them."""
        return llm.APIInstance(
            api=self, api_prompt=API_PROMPT, llm_context=llm_context, tools=self._tools
        )


@callback
def async_register_llm_api(
    hass: HomeAssistant, words: list[dict[str, str]]
) -> CALLBACK_TYPE:
    """Register the setup tools; returns the callback that removes them.

    ``words`` is modules.json (``modules.load_module_words``), read beforehand
    in the executor.
    """
    hass.data[LLM_API_ID] = words
    unregister = llm.async_register_api(
        hass, SetupAPI(hass=hass, id=LLM_API_ID, name=LLM_API_NAME)
    )

    @callback
    def remove() -> None:
        unregister()
        hass.data.pop(LLM_API_ID, None)

    return remove
