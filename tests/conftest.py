"""Fixtures for the Raineworks Dashboards integration's tests."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.raineworks_dashboards import serve
from custom_components.raineworks_dashboards.const import DOMAIN

pytest_plugins = ("pytest_homeassistant_custom_component",)

BUNDLE = "dashboards-0123456789ab.js"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Load the integration from custom_components/."""


@pytest.fixture(autouse=True)
def config_dir(
    hass: HomeAssistant,
    tmp_path_factory: pytest.TempPathFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> Path:
    """A /config of each test's own (the served bundle, clips), and no packaged build
    (a checkout's www/ from `bun run build:integration` never leaks in)."""
    folder = tmp_path_factory.mktemp("config")
    hass.config.config_dir = str(folder)
    monkeypatch.setattr(serve, "PACKAGED", folder / "no-packaged-build")
    return folder


@pytest.fixture
def www(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, config_dir: Path) -> Path:
    """A release's packaged build, as `bun run build:integration` leaves it."""
    packaged = tmp_path / "packaged"
    packaged.mkdir()
    (packaged / BUNDLE).write_text("console.log('dashboards')")
    (packaged / "version.json").write_text(
        json.dumps({"file": BUNDLE, "built": "2026-11-21T00:00:00.000Z"})
    )
    monkeypatch.setattr(serve, "PACKAGED", packaged)
    return packaged


@pytest.fixture
async def setup(hass: HomeAssistant):
    """Set the integration up with some options; returns the entry."""

    async def make(options: dict | None = None) -> MockConfigEntry:
        entry = MockConfigEntry(
            domain=DOMAIN, title="Raineworks Dashboards", options=options or {}
        )
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        return entry

    return make


@pytest.fixture
def people(hass: HomeAssistant) -> None:
    """Alex and Sam with phones, and the admin without one."""
    hass.states.async_set(
        "person.alex",
        "home",
        {"user_id": "u-alex", "device_trackers": ["device_tracker.alex"]},
    )
    hass.states.async_set(
        "person.sam",
        "not_home",
        {"user_id": "u-sam", "device_trackers": ["device_tracker.sam"]},
    )
    hass.states.async_set(
        "person.admin", "unknown", {"user_id": "u-admin", "device_trackers": []}
    )


@pytest.fixture
def warden(hass: HomeAssistant) -> None:
    """Warden, as the dashboards read it: its manager's store's groups."""
    groups = {
        "g-family": SimpleNamespace(name="Family", members=["u-alex", "u-admin"]),
        "g-guests": SimpleNamespace(name="Guests", members=[]),
    }
    hass.data["warden"] = SimpleNamespace(store=SimpleNamespace(groups=groups))
