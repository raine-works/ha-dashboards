"""Which pushes each household member wants on their phone.

Every push `notify_people` sends can name its category (the doorbell, laundry,
the daily brief…). Each household member turns categories on or off for
themselves, in the Home dashboard; a push in a category someone turned off
skips their phones. Security (the alarm going off, doors left open, a lock
that didn't lock) can't be turned off. A push without a category, or with one
this integration doesn't know, goes to everyone it names, as before.

The choices are stored per person (`.storage/raineworks_dashboards.push`), so
they follow the person to every phone they have.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import logging
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
import voluptuous as vol

from .const import CONF_HOUSEHOLD_GROUP, DOMAIN
from .household import household

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.push"
DATA_PUSH = f"{DOMAIN}_push"


@dataclass(frozen=True)
class Category:
    """A kind of push: its id (what `notify_people`'s `category` names), its
    name and description (what the dashboard shows), and whether it always
    comes through."""

    id: str
    name: str
    description: str
    always: bool = False


# In the order the dashboard lists them
CATEGORIES: tuple[Category, ...] = (
    Category(
        "security",
        "Security",
        "The alarm going off, doors left open and locks that didn't lock",
        always=True,
    ),
    Category("doorbell", "Doorbell", "Someone at the door"),
    Category("packages", "Packages", "A delivery left at the door"),
    Category("laundry", "Laundry", "The washer or dryer is done"),
    Category("daily", "Daily brief", "The morning's brief and reading"),
    Category(
        "affirmations", "Affirmations", "Your daily affirmation and birthday wishes"
    ),
    Category("todo", "To-do", "Chores assigned to you, and reminders when they're due"),
    Category("messages", "Messages", "Messages from people in the household"),
    Category("house", "House", "Everything else the house tells you"),
)
CATEGORY_IDS = {category.id for category in CATEGORIES}


class PushPreferences:
    """Each person's categories that are off (everything else is on)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, 1, STORAGE_KEY)
        self._off: dict[str, list[str]] = {}
        self._loaded = False

    async def async_load(self) -> None:
        if self._loaded:
            return
        data = await self._store.async_load() or {}
        off = data.get("off") if isinstance(data, dict) else None
        self._off = {
            person: [c for c in categories if c in CATEGORY_IDS]
            for person, categories in (off or {}).items()
            if isinstance(categories, list)
        }
        self._loaded = True

    def wants(self, person: str, category: str | None) -> bool:
        """Whether this person gets a push in this category (unknown: yes)."""
        if category is None or category not in CATEGORY_IDS:
            return True
        if next(c for c in CATEGORIES if c.id == category).always:
            return True
        return category not in self._off.get(person, [])

    def enabled(self, person: str) -> dict[str, bool]:
        return {c.id: self.wants(person, c.id) for c in CATEGORIES}

    def set(self, person: str, category: str, on: bool) -> None:
        off = [c for c in self._off.get(person, []) if c != category]
        if not on:
            off.append(category)
        self._off[person] = off
        self._store.async_delay_save(lambda: {"off": self._off}, 1)


async def async_preferences(hass: HomeAssistant) -> PushPreferences:
    """The page's preferences, loaded once."""
    preferences: PushPreferences | None = hass.data.get(DATA_PUSH)
    if preferences is None:
        preferences = hass.data[DATA_PUSH] = PushPreferences(hass)
    await preferences.async_load()
    return preferences


def member_of(hass: HomeAssistant, user_id: str) -> str | None:
    """The household member signed in as this user: their person entity, or None
    (the admin, a wall panel's shared user, a guest)."""
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    group = entries[0].options.get(CONF_HOUSEHOLD_GROUP) if entries else None
    for person in household(hass, group)[0]:
        state = hass.states.get(person)
        if state and state.attributes.get("user_id") == user_id:
            return person
    return None


@callback
def async_register_push(hass: HomeAssistant) -> None:
    """The dashboards' commands for a member's own preferences."""
    websocket_api.async_register_command(hass, ws_preferences)
    websocket_api.async_register_command(hass, ws_set_preference)


def _view(person: str | None, preferences: PushPreferences) -> dict[str, Any]:
    enabled = preferences.enabled(person) if person else {}
    return {
        "person": person,
        "categories": [
            {**asdict(category), "enabled": enabled.get(category.id, True)}
            for category in CATEGORIES
        ],
    }


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/push/preferences"})
@websocket_api.async_response
async def ws_preferences(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """The signed-in member's categories and which are on (`person` None when the
    user isn't a household member: nothing to set)."""
    preferences = await async_preferences(hass)
    person = member_of(hass, connection.user.id)
    connection.send_result(msg["id"], _view(person, preferences))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/push/set",
        vol.Required("category"): str,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_set_preference(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Turn one of the signed-in member's own categories on or off. Only their
    own: no one sets another person's, and Security stays on."""
    preferences = await async_preferences(hass)
    person = member_of(hass, connection.user.id)
    category = next((c for c in CATEGORIES if c.id == msg["category"]), None)
    if person is None:
        connection.send_error(
            msg["id"], "not_a_member", "Only household members have push settings"
        )
        return
    if category is None:
        connection.send_error(
            msg["id"], "unknown_category", f"No category {msg['category']}"
        )
        return
    if category.always:
        connection.send_error(
            msg["id"], "always_on", f"{category.name} always comes through"
        )
        return
    preferences.set(person, category.id, msg["enabled"])
    connection.send_result(msg["id"], _view(person, preferences))
