"""To-do with assignment: add for someone, tell them, Mark done from a phone."""

from homeassistant.core import Context, HomeAssistant, SupportsResponse
import pytest
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.raineworks_dashboards.push import async_preferences
from custom_components.raineworks_dashboards.todo import description, due_label

from .test_notify import phones  # noqa: F401

OPTIONS = {"house": {"home_path": "/dashboard-home/home"}}


@pytest.fixture
def chores(hass: HomeAssistant, phones):  # noqa: F811
    """The Chores list with one open item, and every to-do action mocked."""
    hass.states.async_set("todo.chores", "1", {"friendly_name": "Chores"})
    hass.states.async_set(
        "person.sam",
        "home",
        {
            "friendly_name": "Sam Rivera",
            "user_id": "u-sam",
            "device_trackers": ["device_tracker.sam"],
        },
    )
    items = [{"uid": "u1", "summary": "Water the plants", "due": "2026-11-26"}]
    return {
        "add": async_mock_service(hass, "todo", "add_item"),
        "update": async_mock_service(hass, "todo", "update_item"),
        "get": async_mock_service(
            hass,
            "todo",
            "get_items",
            response={"todo.chores": {"items": items}},
            supports_response=SupportsResponse.ONLY,
        ),
        "alex": async_mock_service(hass, "notify", "mobile_app_alex_s_phone"),
        "sam": async_mock_service(hass, "notify", "mobile_app_sam_pixel"),
    }


def test_description_and_due() -> None:
    assert (
        description("Sam Rivera", " Use the blue can ")
        == "Assigned to Sam Rivera\nUse the blue can"
    )
    assert description(None, None) == ""
    assert due_label("2026-11-26") == "Thu Nov 26"
    assert due_label(None) == ""


async def test_add_for_someone_tells_them(hass: HomeAssistant, chores, setup) -> None:
    await setup(OPTIONS)
    await hass.services.async_call(
        "raineworks_dashboards",
        "add_todo_item",
        {
            "list": "todo.chores",
            "item": "Water the plants",
            "person": "person.sam",
            "note": "Both pots",
            "due_date": "2026-11-26",
        },
        blocking=True,
    )
    added = dict(chores["add"][0].data)
    assert added == {
        "entity_id": "todo.chores",
        "item": "Water the plants",
        "description": "Assigned to Sam Rivera\nBoth pots",
        "due_date": "2026-11-26",
    }
    assert chores["alex"] == []
    push = chores["sam"][0].data
    assert push["title"] == "Chores: Water the plants"
    assert push["message"] == "Assigned to you · due Thu Nov 26. Tap to see it."
    assert push["data"]["actions"] == [
        {"action": "TODO_DONE|todo.chores|u1", "title": "Mark done"}
    ]
    assert (
        push["data"]["clickAction"] == "/dashboard-home/home?todo=todo.chores&item=u1"
    )


async def test_for_anyone_tells_everyone_but_who_added_it(
    hass: HomeAssistant, chores, setup
) -> None:
    await setup(OPTIONS)
    await hass.services.async_call(
        "raineworks_dashboards",
        "notify_todo_assignee",
        {"list": "todo.chores", "item": "Water the plants"},
        blocking=True,
        context=Context(user_id="u-sam"),
    )
    # Sam added it: only Alex hears, told who added it
    assert chores["sam"] == []
    assert (
        chores["alex"][0].data["message"]
        == "Sam added this for anyone · due Thu Nov 26. Tap to see it."
    )


async def test_a_to_do_push_skips_who_turned_to_do_off(
    hass: HomeAssistant, chores, setup
) -> None:
    await setup(OPTIONS)
    (await async_preferences(hass)).set("person.sam", "todo", False)
    await hass.services.async_call(
        "raineworks_dashboards",
        "notify_todo_assignee",
        {"list": "todo.chores", "item": "Water the plants", "person": "person.sam"},
        blocking=True,
    )
    assert chores["sam"] == []


async def test_mark_done_from_a_phone(hass: HomeAssistant, chores, setup) -> None:
    await setup(OPTIONS)
    for action in (
        "TODO_DONE|todo.chores|u1",
        "TODO_DONE|todo.gone|u1",
        "TODO_DONE|light.x|u1",
        "OTHER|x",
    ):
        hass.bus.async_fire("mobile_app_notification_action", {"action": action})
    await hass.async_block_till_done()
    assert [dict(c.data) for c in chores["update"]] == [
        {"entity_id": "todo.chores", "item": "u1", "status": "completed"}
    ]
