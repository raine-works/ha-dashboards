"""Serving the dashboards bundle: a release's packaged build, an admin's upload, old
builds pruned.
"""

import json
from pathlib import Path

import aiohttp
from homeassistant.components import frontend
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.raineworks_dashboards import serve
from custom_components.raineworks_dashboards.bundle import (
    BundleError,
    find_bundle,
    install,
    install_packaged,
    prune,
)
from custom_components.raineworks_dashboards.const import CONF_SERVE_BUNDLE

from .conftest import BUNDLE

NEW = "dashboards-fedcba987654.js"


async def _frontend(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "frontend", {})


def _modules(hass: HomeAssistant) -> frozenset[str]:
    return hass.data[frontend.DATA_EXTRA_MODULE_URL].urls


def _version(file: str, built: str) -> bytes:
    return json.dumps({"file": file, "built": built}).encode()


async def test_serves_the_bundle_on_every_page(
    hass: HomeAssistant, www: Path, config_dir: Path, setup
) -> None:
    await _frontend(hass)
    entry = await setup()
    assert f"/raineworks_dashboards/{BUNDLE}" in _modules(hass)
    # Served from /config, where an update of the integration's own folder never reaches
    assert (config_dir / "raineworks_dashboards" / "www" / BUNDLE).is_file()

    # Unloading takes it off the pages again
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert f"/raineworks_dashboards/{BUNDLE}" not in _modules(hass)


async def test_serves_nothing_when_told_not_to(
    hass: HomeAssistant, www: Path, setup
) -> None:
    await _frontend(hass)
    await setup({CONF_SERVE_BUNDLE: False})
    assert not any(url.startswith("/raineworks_dashboards/") for url in _modules(hass))


async def test_sets_up_without_a_built_bundle(
    hass: HomeAssistant, tmp_path: Path, monkeypatch, config_dir: Path, setup
) -> None:
    monkeypatch.setattr(serve, "PACKAGED", tmp_path / "nothing")
    await _frontend(hass)
    await setup()
    assert not any(url.startswith("/raineworks_dashboards/") for url in _modules(hass))


def test_find_bundle(tmp_path: Path) -> None:
    assert find_bundle(tmp_path) is None
    (tmp_path / "version.json").write_text('{"file": "../secrets.yaml"}')
    assert find_bundle(tmp_path) is None
    (tmp_path / "version.json").write_text(f'{{"file": "{BUNDLE}"}}')
    # Named, but not there
    assert find_bundle(tmp_path) is None
    (tmp_path / BUNDLE).write_text("")
    assert find_bundle(tmp_path) == BUNDLE


def test_install_refuses_what_isnt_a_build(tmp_path: Path) -> None:
    for files in (
        {"../evil.js": b"", "version.json": _version(BUNDLE, "x")},
        {BUNDLE: b""},
        {BUNDLE: b"", "version.json": _version(NEW, "x")},
        {"secrets.yaml": b"", BUNDLE: b"", "version.json": _version(BUNDLE, "x")},
    ):
        try:
            install(files, tmp_path / "served")
        except BundleError:
            continue
        raise AssertionError(f"installed {list(files)}")


def test_a_newer_packaged_build_replaces_an_older_one(tmp_path: Path) -> None:
    packaged, served = tmp_path / "packaged", tmp_path / "served"
    install({BUNDLE: b"old", "version.json": _version(BUNDLE, "2026-01-01")}, served)
    packaged.mkdir()
    (packaged / NEW).write_text("new")
    (packaged / "version.json").write_bytes(_version(NEW, "2026-06-01"))
    assert install_packaged(packaged, served)
    assert find_bundle(served) == NEW
    # An older release never replaces a newer upload
    (packaged / "version.json").write_bytes(_version(NEW, "2025-01-01"))
    install({BUNDLE: b"dev", "version.json": _version(BUNDLE, "2026-07-01")}, served)
    assert not install_packaged(packaged, served)
    assert find_bundle(served) == BUNDLE


def test_prune_keeps_the_two_newest_bundles_and_their_chunks(tmp_path: Path) -> None:
    served = tmp_path
    names = [
        "dashboards-aaaaaaaaaaaa.js",
        "dashboards-bbbbbbbbbbbb.js",
        "dashboards-cccccccccccc.js",
    ]
    for n, name in enumerate(names):
        (served / name).write_text(f"import('./chunk-{n}.js')")
        (served / f"{name}.br").write_text("")
        (served / f"chunk-{n}.js").write_text(
            "import('./chunk-deep.js')" if n == 2 else ""
        )
        import os

        os.utime(served / name, (n, n))
    (served / "chunk-deep.js").write_text("")
    (served / "chunk-orphan.js").write_text("")
    (served / "version.json").write_text(json.dumps({"file": names[2]}))
    removed = prune(served)
    assert sorted(removed) == sorted(
        [
            "dashboards-aaaaaaaaaaaa.js",
            "dashboards-aaaaaaaaaaaa.js.br",
            "chunk-0.js",
            "chunk-orphan.js",
        ]
    )
    assert (served / "chunk-deep.js").is_file() and (served / "chunk-1.js").is_file()


async def test_an_admin_uploads_a_build(
    hass: HomeAssistant, www: Path, config_dir: Path, setup, hass_client
) -> None:
    await _frontend(hass)
    await setup()
    updated = async_capture_events(hass, "lovelace_updated")
    client = await hass_client()
    form = aiohttp.FormData()
    form.add_field("files", b"console.log('new')", filename=NEW)
    form.add_field(
        "files", _version(NEW, "2026-12-01T00:00:00.000Z"), filename="version.json"
    )
    response = await client.post("/api/raineworks_dashboards/bundle", data=form)
    assert response.status == 200, await response.text()
    assert await response.json() == {"file": NEW, "served": True}
    assert f"/raineworks_dashboards/{NEW}" in _modules(hass)
    assert f"/raineworks_dashboards/{BUNDLE}" not in _modules(hass)
    served = config_dir / "raineworks_dashboards" / "www"
    assert find_bundle(served) == NEW and (served / BUNDLE).is_file()
    assert isinstance(updated, list)


async def test_only_admins_upload(
    hass: HomeAssistant, www: Path, setup, hass_client, hass_admin_user
) -> None:
    await setup()
    hass_admin_user.groups = []
    client = await hass_client()
    form = aiohttp.FormData()
    form.add_field("files", b"x", filename=NEW)
    response = await client.post("/api/raineworks_dashboards/bundle", data=form)
    assert response.status == 403
