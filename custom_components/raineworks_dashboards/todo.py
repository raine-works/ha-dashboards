"""To-do with assignment: add an item for someone, tell them, and a Mark done button.

Home Assistant's to-do items have no assignee, so it's an `Assigned to <name>`
line in the item's description (the dashboards' to-do dialog reads and writes
it; Home Assistant's own to-do page shows it). The actions:

- `add_todo_item`: adds an item (for a person or anyone, with a note and a due
  date) and tells whom it's for
- `notify_todo_assignee`: pushes to the assignee (or, for anyone, the household
  but whoever added it), linking to the item in the Home dashboard (the House
  options' `home_path`), with Mark done
- Mark done (`TODO_DONE|<list>|<uid>`, from a phone) completes the item
"""

from __future__ import annotations

from datetime import date
from typing import Any
from urllib.parse import quote

from homeassistant.core import (
    Event,
    HomeAssistant,
    ServiceCall,
    SupportsResponse,
    callback,
)
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util, slugify
import voluptuous as vol

from .const import CONF_HOUSE, DOMAIN
from .notify import NOTIFY_ACTION

DONE = "TODO_DONE"
ASSIGNED = "Assigned to"

ADD_SCHEMA = vol.Schema(
    {
        vol.Required("list"): cv.entity_domain("todo"),
        vol.Required("item"): cv.string,
        vol.Optional("person"): vol.Any(None, "", cv.entity_domain("person")),
        vol.Optional("note"): vol.Any(None, cv.string),
        vol.Optional("due_date"): vol.Any(None, "", cv.date),
    }
)

NOTIFY_SCHEMA = vol.Schema(
    {
        vol.Optional("person"): vol.Any(None, "", cv.entity_domain("person")),
        vol.Required("list"): cv.entity_domain("todo"),
        vol.Required("item"): cv.string,
        vol.Optional("uid"): vol.Any(None, cv.string),
        vol.Optional("uids"): vol.Any(None, vol.All(cv.ensure_list, [cv.string])),
    }
)


def description(assignee: str | None, note: str | None) -> str:
    """The item's description: the assignee's line, then the note."""
    lines = [f"{ASSIGNED} {assignee}"] if assignee else []
    if note and note.strip():
        lines.append(note.strip())
    return "\n".join(lines)


def due_label(due: str | None) -> str:
    """ "Thu Nov 26", or with a time "Thu Nov 26, 5:30 PM"; "" without one."""
    if not due:
        return ""
    if "T" in due and (at := dt_util.parse_datetime(due)):
        local = dt_util.as_local(at)
        return f"{local:%a %b} {local.day}, {local:%I:%M %p}".replace(" 0", " ")
    try:
        day = date.fromisoformat(due)
    except ValueError:
        return ""
    return f"{day:%a %b} {day.day}"


def first_name(hass: HomeAssistant, person: str | None) -> str:
    """The first word of a person entity's name.

    "" when there's no person, or no state for that entity id.
    """
    state = hass.states.get(person) if person else None
    return state.name.split(" ")[0] if state else ""


def person_of_user(hass: HomeAssistant, user_id: str | None) -> str | None:
    """The person whose user made the call (who added or assigned it)."""
    if not user_id:
        return None
    for person in hass.states.async_all("person"):
        if person.attributes.get("user_id") == user_id:
            return person.entity_id
    return None


def message(
    *,
    several: bool,
    for_anyone: bool,
    assigner: str,
    self_assigned: bool,
    items: str,
    due: str,
) -> str:
    """What the push says."""
    if for_anyone:
        what = (
            f"{assigner} added {'these' if several else 'this'} for anyone"
            if assigner
            else "For anyone in the house"
        )
    elif assigner and not self_assigned:
        what = f"{assigner} assigned you {'these' if several else 'this'}"
    else:
        what = "Assigned to you"
    if several:
        return f"{what}: {items}. Tap to see them."
    return f"{what}{f' · due {due}' if due else ''}. Tap to see it."


class Todo:
    """The to-do actions, reading the House options at each call."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    def home_path(self) -> str | None:
        entries = self.hass.config_entries.async_loaded_entries(DOMAIN)
        house = (entries[0].options.get(CONF_HOUSE) or {}) if entries else {}
        return house.get("home_path") or None

    async def open_items(self, todo_list: str) -> list[dict[str, Any]]:
        response = await self.hass.services.async_call(
            "todo",
            "get_items",
            {"entity_id": todo_list, "status": "needs_action"},
            blocking=True,
            return_response=True,
        )
        return list(((response or {}).get(todo_list) or {}).get("items") or [])

    async def notify(self, data: dict[str, Any], user_id: str | None) -> dict[str, Any]:
        todo_list, item = data["list"], data["item"]
        person = data.get("person") or None
        uids = list(data.get("uids") or [])
        several = len(uids) > 1
        found: dict[str, Any] = {}
        if not several:
            items = await self.open_items(todo_list)
            by_uid = [
                i for i in items if data.get("uid") and i.get("uid") == data["uid"]
            ]
            by_name = [i for i in items if i.get("summary") == item]
            found = (by_uid or by_name or [{}])[-1]
        uid = "" if several else found.get("uid") or data.get("uid") or ""
        by_person = person_of_user(self.hass, user_id)
        list_state = self.hass.states.get(todo_list)
        list_name = list_state.name if list_state else "To-do"
        path = self.home_path()
        link = (
            f"{path}?todo={quote(todo_list)}" + (f"&item={quote(uid)}" if uid else "")
            if path
            else None
        )
        push: dict[str, Any] = {
            "tag": f"todo_{uid}"
            if uid
            else (
                f"todo_several_{int(dt_util.utcnow().timestamp())}"
                if several
                else f"todo_{slugify(item)}"
            ),
            "group": "todo",
            "channel": "To-do",
        }
        if link:
            push |= {"clickAction": link, "url": link}
        if uid:
            push["actions"] = [
                {"action": f"{DONE}|{todo_list}|{uid}", "title": "Mark done"}
            ]
        what = f"{len(uids)} items" if several else item
        return (
            await self.hass.services.async_call(
                DOMAIN,
                NOTIFY_ACTION,
                {
                    "people": [person] if person else [],
                    "exclude": [by_person] if by_person and not person else [],
                    "title": f"{list_name}: {what}",
                    "message": message(
                        several=several,
                        for_anyone=not person,
                        assigner=first_name(self.hass, by_person),
                        self_assigned=by_person == person,
                        items=item,
                        due=due_label(found.get("due")),
                    ),
                    "data": push,
                    # Each member's phone alerts: To-do (push.py)
                    "category": "todo",
                },
                blocking=True,
                return_response=True,
            )
            or {}
        )

    async def add(self, data: dict[str, Any], user_id: str | None) -> dict[str, Any]:
        person = data.get("person") or None
        assignee = (
            self.hass.states.get(person).name
            if person and self.hass.states.get(person)
            else None
        )
        add: dict[str, Any] = {"entity_id": data["list"], "item": data["item"]}
        if text := description(assignee, data.get("note")):
            add["description"] = text
        if due := data.get("due_date"):
            add["due_date"] = due.isoformat() if isinstance(due, date) else str(due)
        await self.hass.services.async_call("todo", "add_item", add, blocking=True)
        return await self.notify(
            {"person": person, "list": data["list"], "item": data["item"]}, user_id
        )

    @callback
    def mark_done(self, event: Event) -> None:
        """A phone's Mark done: complete the item (on an existing to-do list)."""
        action = event.data.get("action")
        if not isinstance(action, str) or not action.startswith(f"{DONE}|"):
            return
        parts = action.split("|")
        if len(parts) != 3 or not parts[2] or self.hass.states.get(parts[1]) is None:
            return
        if not parts[1].startswith("todo."):
            return
        self.hass.async_create_task(
            self.hass.services.async_call(
                "todo",
                "update_item",
                {"entity_id": parts[1], "item": parts[2], "status": "completed"},
                blocking=True,
            )
        )


@callback
def async_register_todo(hass: HomeAssistant) -> Todo:
    """The actions (once); the Mark done listener goes with the config entry."""
    todo = Todo(hass)

    async def add_todo_item(call: ServiceCall) -> dict[str, Any]:
        return await todo.add(dict(call.data), call.context.user_id)

    async def notify_todo_assignee(call: ServiceCall) -> dict[str, Any]:
        return await todo.notify(dict(call.data), call.context.user_id)

    hass.services.async_register(
        DOMAIN,
        "add_todo_item",
        add_todo_item,
        schema=ADD_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        "notify_todo_assignee",
        notify_todo_assignee,
        schema=NOTIFY_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    return todo
