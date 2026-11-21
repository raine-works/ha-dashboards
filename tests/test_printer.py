"""The receipt printer: notes and to-do lists, one slip at a time."""

from datetime import datetime

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.raineworks_dashboards.printer import checklist, note_body

ITEMS = [
    {
        "uid": "u1",
        "summary": "Milk",
        "due": "2026-11-26",
        "description": "Assigned to Sam Rivera",
    },
    {
        "uid": "u2",
        "summary": "A very long item that goes on and on past the edge of the roll",
    },
]


def test_a_checklist() -> None:
    assert checklist(ITEMS) == (
        "[ ] Milk\n"
        "    Due Thu Nov 26, for Sam\n"
        "[ ] A very long item that goes on and on\n"
        "    past the edge of the roll"
    )
    # Sam's own slip doesn't say "for Sam"
    assert checklist(ITEMS[:1], owner="Sam") == "[ ] Milk\n    Due Thu Nov 26"
    for line in checklist(ITEMS).split("\n"):
        assert len(line) <= 48


def test_a_note_is_big() -> None:
    assert (
        note_body("Back at 5, pizza in the oven for everyone")
        == "Back at 5, pizza in the\noven for everyone"
    )


@pytest.fixture
def printer(hass: HomeAssistant):
    """The kitchen's ESC/POS printer, and the Shopping List."""
    er.async_get(hass).async_get_or_create(
        "notify", "escpos_printer", "kitchen", suggested_object_id="kitchen_printer"
    )
    hass.states.async_set("todo.shopping_list", "2", {"friendly_name": "Shopping List"})
    async_mock_service(
        hass,
        "todo",
        "get_items",
        response={"todo.shopping_list": {"items": ITEMS}},
        supports_response=SupportsResponse.ONLY,
    )
    return async_mock_service(hass, "escpos_printer", "print_text_utf8")


async def test_print_a_note(
    hass: HomeAssistant, printer, setup, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(
        datetime(2026, 11, 21, 13, 5, tzinfo=dt_util.get_default_time_zone())
    )
    await setup()
    await hass.services.async_call(
        "raineworks_dashboards",
        "print_note",
        {"message": "Back at 5", "sender": "Alex"},
        blocking=True,
    )
    parts = [dict(c.data) for c in printer]
    assert [p["text"] for p in parts] == [
        "Note",
        "From Alex - Sat, Nov 21, 1:05 PM",
        "-" * 32,
        "Back at 5",
    ]
    assert all(p["entity_id"] == "notify.kitchen_printer" for p in parts)
    assert parts[-1]["cut"] == "full" and parts[-1]["width"] == "double"


async def test_print_picked_items_for_one_person(
    hass: HomeAssistant, printer, setup
) -> None:
    await setup()
    response = await hass.services.async_call(
        "raineworks_dashboards",
        "print_todo_list",
        {"list": "todo.shopping_list", "uids": ["u1"], "person": "Sam Rivera"},
        blocking=True,
        return_response=True,
    )
    assert response == {"printed": 1}
    parts = [dict(c.data) for c in printer]
    assert parts[0]["text"] == "Shopping List - Sam"
    assert parts[-1]["text"] == "[ ] Milk\n    Due Thu Nov 26"
    assert parts[-1]["align"] == "left"


async def test_nothing_to_print_or_no_printer(
    hass: HomeAssistant, printer, setup
) -> None:
    await setup()
    with pytest.raises(ServiceValidationError, match="Nothing"):
        await hass.services.async_call(
            "raineworks_dashboards",
            "print_todo_list",
            {"list": "todo.shopping_list", "uids": ["gone"]},
            blocking=True,
        )
    er.async_get(hass).async_remove("notify.kitchen_printer")
    with pytest.raises(ServiceValidationError, match="No receipt printer"):
        await hass.services.async_call(
            "raineworks_dashboards", "print_note", {"message": "Hi"}, blocking=True
        )
