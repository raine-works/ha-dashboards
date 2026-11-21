"""The receipt printer (ESC/POS, 80mm: 48 characters a line, 24 when large).

`print_note` prints a note (titled "Note", who and when, the message big and
centered); `print_todo_list` prints a to-do list's open items (or those picked)
as a checklist to take along, each with its due date and who it's for, or one
person's own slip. Every slip is a big title, a line under it, a rule, the body,
then a cut; one at a time, so two never print into each other. The printer is
the first `escpos_printer` notify entity unless one is named.
"""

from __future__ import annotations

import asyncio
import re
import textwrap
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.util import dt as dt_util
import voluptuous as vol

from .const import DOMAIN
from .todo import due_label

PRINT = ("escpos_printer", "print_text_utf8")
LINE, LARGE_LINE, TITLE_MAX = 48, 24, 24
RULE = "-" * 32
ASSIGNED = re.compile(r"Assigned to ([^\n]+)")

NOTE_SCHEMA = vol.Schema(
    {
        vol.Required("message"): vol.All(cv.string, vol.Length(min=1, max=1000)),
        vol.Optional("sender"): vol.Any(None, cv.string),
        vol.Optional("printer"): vol.Any(None, "", cv.entity_domain("notify")),
    }
)
LIST_SCHEMA = vol.Schema(
    {
        vol.Required("list"): cv.entity_domain("todo"),
        vol.Optional("uids"): vol.Any(None, vol.All(cv.ensure_list, [cv.string])),
        vol.Optional("person"): vol.Any(None, cv.string),
        vol.Optional("printer"): vol.Any(None, "", cv.entity_domain("notify")),
    }
)


def stamp(now: Any) -> str:
    """ "Sat, Nov 21, 1:05 PM" """
    return f"{now:%a, %b} {now.day}, {now.hour % 12 or 12}:{now:%M %p}"


def note_body(message: str) -> str:
    """The note, big: wrapped to 24 characters a line."""
    return "\n".join(
        textwrap.fill(paragraph, LARGE_LINE)
        for paragraph in message.strip().split("\n")
    )


def checklist(items: list[dict[str, Any]], owner: str = "") -> str:
    """`[ ] item` per item (a hanging indent when it wraps), then its due date and who
    it's for (not on the owner's own slip)."""
    lines: list[str] = []
    indent = "    "

    def hanging(text: str) -> str:
        # Wrapped to 44, continued 4 in: a line is never over 48
        return f"\n{indent}".join(textwrap.wrap(text, LINE - len(indent)))

    for item in items:
        lines.append(hanging(f"[ ] {item.get('summary', '')}"))
        details = []
        if due := due_label(item.get("due")):
            details.append(f"Due {due}")
        who = ASSIGNED.search(item.get("description") or "")
        assignee = who.group(1).strip().split(" ")[0] if who else ""
        if assignee and assignee.lower() != owner.lower():
            details.append(f"for {assignee}")
        if details:
            lines.append(hanging(f"{indent}{', '.join(details)}"))
    return "\n".join(lines)


class Printer:
    """Slips on the receipt printer, one at a time."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._lock = asyncio.Lock()

    def find(self, named: str | None) -> str:
        if named:
            return named
        registry = er.async_get(self.hass)
        printers = sorted(
            e.entity_id
            for e in registry.entities.values()
            if e.platform == "escpos_printer"
            and e.domain == "notify"
            and not e.disabled
        )
        if not printers:
            raise ServiceValidationError("No receipt printer found")
        return printers[0]

    async def slip(
        self, printer: str, title: str, subtitle: str, body: str, large: bool
    ) -> None:
        """Title, subtitle, rule, body, cut. Each part ends with a line feed (the
        integration sends text without one)."""
        parts: list[dict[str, Any]] = [
            {
                "text": title[:TITLE_MAX],
                "align": "center",
                "bold": True,
                "width": "double",
                "height": "double",
                "feed": 1,
                "cut": "none",
            },
        ]
        if subtitle:
            parts.append(
                {"text": subtitle, "align": "center", "feed": 1, "cut": "none"}
            )
        parts.append({"text": RULE, "align": "center", "feed": 2, "cut": "none"})
        parts.append(
            {
                "text": body,
                "align": "center" if large else "left",
                "width": "double" if large else "normal",
                "height": "double" if large else "normal",
                "feed": 4,
                "cut": "full",
            }
        )
        async with self._lock:
            for part in parts:
                await self.hass.services.async_call(
                    *PRINT, {"entity_id": printer, **part}, blocking=True
                )

    async def note(self, data: dict[str, Any]) -> None:
        who = (data.get("sender") or "").strip()
        when = stamp(dt_util.now())
        await self.slip(
            self.find(data.get("printer")),
            "Note",
            f"From {who} - {when}" if who else when,
            note_body(data["message"]),
            large=True,
        )

    async def todo_list(self, data: dict[str, Any]) -> dict[str, Any]:
        todo_list = data["list"]
        response = await self.hass.services.async_call(
            "todo",
            "get_items",
            {"entity_id": todo_list, "status": "needs_action"},
            blocking=True,
            return_response=True,
        )
        items = list(((response or {}).get(todo_list) or {}).get("items") or [])
        if picked := set(data.get("uids") or []):
            items = [i for i in items if i.get("uid") in picked]
        if not items:
            raise ServiceValidationError("Nothing on the list to print")
        owner = (data.get("person") or "").strip().split(" ")[0]
        state = self.hass.states.get(todo_list)
        name = (state.name if state else "To-do") + (f" - {owner}" if owner else "")
        count = f"{len(items)} item{'' if len(items) == 1 else 's'}"
        await self.slip(
            self.find(data.get("printer")),
            name,
            f"{stamp(dt_util.now())} - {count}",
            checklist(items, owner),
            large=False,
        )
        return {"printed": len(items)}


@callback
def async_register_printer(hass: HomeAssistant) -> None:
    """The print actions."""
    printer = Printer(hass)

    async def print_note(call: ServiceCall) -> None:
        await printer.note(dict(call.data))

    async def print_todo_list(call: ServiceCall) -> dict[str, Any]:
        return await printer.todo_list(dict(call.data))

    hass.services.async_register(DOMAIN, "print_note", print_note, schema=NOTE_SCHEMA)
    hass.services.async_register(
        DOMAIN,
        "print_todo_list",
        print_todo_list,
        schema=LIST_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
