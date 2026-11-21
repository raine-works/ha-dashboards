"""Who the household is: the people the dashboards list, message and assign chores to.

With Warden installed and a household group picked in the options, the household
is that group's members (their person entities). Otherwise it's every person
with a device tracker, which leaves out the admin account and pets.
"""

from __future__ import annotations

from homeassistant.core import HomeAssistant

from .const import WARDEN_DOMAIN


def _warden_api():
    """Warden's public API (Warden 0.3.2+), or None without it."""
    try:
        from custom_components.warden import api  # noqa: PLC0415
    except ImportError:
        return None
    return api if hasattr(api, "async_get_groups") else None


def _warden_store_groups(hass: HomeAssistant) -> dict | None:
    """Warden's groups by id from its manager in memory, for Warden before 0.3.2.

    Anything unexpected counts as no Warden.
    """
    manager = hass.data.get(WARDEN_DOMAIN)
    groups = getattr(getattr(manager, "store", None), "groups", None)
    return groups if isinstance(groups, dict) else None


def _groups(hass: HomeAssistant) -> dict[str, tuple[str, set[str]]] | None:
    """Warden's groups as id → (name, member user ids), or None without Warden."""
    if (api := _warden_api()) is not None:
        groups = api.async_get_groups(hass)
        if groups is None:
            return None
        return {g.id: (g.name, set(g.members)) for g in groups}
    groups = _warden_store_groups(hass)
    if groups is None:
        return None
    return {
        str(group_id): (
            str(getattr(group, "name", group_id)),
            {str(m) for m in getattr(group, "members", [])},
        )
        for group_id, group in groups.items()
    }


def warden_groups(hass: HomeAssistant) -> dict[str, str] | None:
    """Warden's groups as id → name, or None without Warden."""
    groups = _groups(hass)
    return None if groups is None else {gid: name for gid, (name, _) in groups.items()}


def warden_group_members(hass: HomeAssistant, group_id: str) -> set[str] | None:
    """A Warden group's member user ids; None without Warden or that group."""
    group = (_groups(hass) or {}).get(group_id)
    return group[1] if group else None


def household(hass: HomeAssistant, group_id: str | None) -> tuple[list[str], str]:
    """The household's person entity ids, and where they came from.

    `warden` when they're a Warden group's members, `trackers` when they're
    every person with a device tracker (no group picked, or it's gone).
    """
    people = hass.states.async_all("person")
    if group_id and (members := warden_group_members(hass, group_id)) is not None:
        return (
            sorted(
                person.entity_id
                for person in people
                if person.attributes.get("user_id") in members
            ),
            "warden",
        )
    return (
        sorted(
            person.entity_id
            for person in people
            if person.attributes.get("device_trackers")
        ),
        "trackers",
    )
