"""Serving the bundle on every page, and an admin's upload of a new build.

The bundle is loaded on every page by its hashed name (`frontend.add_extra_js_url`),
which pages pick up as they load; open dashboards notice a new one from version.json
themselves. After an upload the wall panels reload and every Lovelace dashboard is told
it changed.
"""

from __future__ import annotations

from http import HTTPStatus
import logging
from pathlib import Path

from aiohttp import BodyPartReader, web
from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.core import HomeAssistant, callback

from .bundle import BundleError, find_bundle, install, install_packaged
from .const import DOMAIN, STATIC_URL, WWW_DIR

_LOGGER = logging.getLogger(__name__)

BUNDLE_URL = f"/api/{DOMAIN}/bundle"
# A build with its chunks and their .br / .gz copies is ~4 MB today
MAX_UPLOAD_BYTES = 40 * 1024 * 1024
PACKAGED = Path(__file__).parent / WWW_DIR
DATA = f"{DOMAIN}_served"


def served_dir(hass: HomeAssistant) -> Path:
    """/config/raineworks_dashboards/www."""
    return Path(hass.config.path(DOMAIN, WWW_DIR))


class BundleServer:
    """The one bundle loaded on every page (while some entry serves it)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.url: str | None = None
        self.users = 0
        self._static = False

    async def async_start(self) -> None:
        """Serve the newest build: the packaged release's when it's newer than what's
        served.
        """
        self.users += 1
        served = served_dir(self.hass)
        if await self.hass.async_add_executor_job(install_packaged, PACKAGED, served):
            _LOGGER.info("Installed the packaged dashboards build")
        if not self._static:
            # Hashed names never change content, so they're cached for good; the
            # dashboards read version.json with no-store themselves
            await self.hass.http.async_register_static_paths(
                [StaticPathConfig(STATIC_URL, str(served), True)]
            )
            self._static = True
        self._load(await self.hass.async_add_executor_job(find_bundle, served))

    @callback
    def async_stop(self) -> None:
        """One entry no longer serves it; the last one takes it off the pages."""
        self.users = max(0, self.users - 1)
        if self.users == 0:
            self._load(None)

    @callback
    def _load(self, file: str | None) -> None:
        url = f"{STATIC_URL}/{file}" if file else None
        if url == self.url:
            return
        if self.url:
            frontend.remove_extra_js_url(self.hass, self.url)
        if url and self.users:
            frontend.add_extra_js_url(self.hass, url)
        self.url = url if self.users else None

    async def async_installed(self, file: str) -> None:
        """A new build is in: pages load it from now on, open ones are told."""
        self._load(file)
        for entry in self.hass.config_entries.async_loaded_entries(DOMAIN):
            await entry.runtime_data.async_reload()
        for url_path in _dashboards(self.hass):
            self.hass.bus.async_fire("lovelace_updated", {"url_path": url_path})


def _dashboards(hass: HomeAssistant) -> list[str]:
    """Every Lovelace dashboard's url_path (None for the default one)."""
    lovelace = hass.data.get("lovelace")
    dashboards = getattr(lovelace, "dashboards", None) or {}
    return list(dashboards)


def server(hass: HomeAssistant) -> BundleServer:
    """The page-wide server (one, whatever the entries)."""
    if DATA not in hass.data:
        hass.data[DATA] = BundleServer(hass)
    return hass.data[DATA]


class BundleUploadView(HomeAssistantView):
    """POST a build (multipart: its files) from `bun run build`; admins only."""

    url = BUNDLE_URL
    name = f"api:{DOMAIN}:bundle"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        if not request["hass_user"].is_admin:
            return self.json_message("Admins only", HTTPStatus.FORBIDDEN)
        if (request.content_length or 0) > MAX_UPLOAD_BYTES:
            return self.json_message("Too big", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        files: dict[str, bytes] = {}
        size = 0
        try:
            reader = await request.multipart()
            while (part := await reader.next()) is not None:
                if not isinstance(part, BodyPartReader) or not part.filename:
                    continue
                content = await part.read(decode=False)
                size += len(content)
                if size > MAX_UPLOAD_BYTES:
                    return self.json_message(
                        "Too big", HTTPStatus.REQUEST_ENTITY_TOO_LARGE
                    )
                files[part.filename] = bytes(content)
            file = await hass.async_add_executor_job(install, files, served_dir(hass))
        except (BundleError, ValueError, AssertionError) as error:
            return self.json_message(
                str(error) or "Not a build", HTTPStatus.BAD_REQUEST
            )
        bundles = server(hass)
        await bundles.async_installed(file)
        return self.json({"file": file, "served": bundles.users > 0})
