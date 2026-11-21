"""Voice clips the dashboards announce (the intercom's recordings, camera talkback).

Any signed-in user can upload one: Home Assistant's own local-media upload is
for admins only, which made every wall panel's shared user an admin. A clip is
kept in a folder of its own outside /config/www (never public), handed back as
a short-lived signed URL that the speakers and TVs fetch without a token, and
deleted after CLIP_MAX_AGE.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from http import HTTPStatus
from pathlib import Path
import re
import time
import uuid

from aiohttp import web
from homeassistant.components.http import HomeAssistantView, auth
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval

from .const import DOMAIN

CLIPS_URL = f"/api/{DOMAIN}/clips"
# A minute of 16 kHz 16-bit mono is ~1.9 MB; room for a long message at 48 kHz
MAX_CLIP_BYTES = 6 * 1024 * 1024
# Long enough for the speakers to fetch it (Music Assistant can take 15s to start)
SIGNED_FOR = timedelta(minutes=5)
CLIP_MAX_AGE = timedelta(minutes=10)
SWEEP_EVERY = timedelta(minutes=5)
CLIP_NAME = re.compile(r"^[0-9a-f]{32}\.wav$")


def clips_dir(hass: HomeAssistant) -> Path:
    """Where clips are kept: /config/raineworks_dashboards/clips."""
    return Path(hass.config.path(DOMAIN, "clips"))


def is_wav(data: bytes) -> bool:
    """A RIFF WAVE file, by its header."""
    return len(data) > 44 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"


def sweep(folder: Path, max_age: timedelta, now: float | None = None) -> int:
    """Delete clips older than max_age; returns how many. Run in the executor."""
    if not folder.is_dir():
        return 0
    cutoff = (now if now is not None else time.time()) - max_age.total_seconds()
    removed = 0
    for clip in folder.iterdir():
        if CLIP_NAME.match(clip.name) and clip.stat().st_mtime < cutoff:
            clip.unlink(missing_ok=True)
            removed += 1
    return removed


def _write(folder: Path, name: str, data: bytes) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)


class ClipUploadView(HomeAssistantView):
    """POST a WAV (the request body): answers its signed URL, a path on this server."""

    url = CLIPS_URL
    name = f"api:{DOMAIN}:clips"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        if (request.content_length or 0) > MAX_CLIP_BYTES:
            return self.json_message(
                "Clip too long", HTTPStatus.REQUEST_ENTITY_TOO_LARGE
            )
        # The whole body, chunk by chunk: read(n) returns only what has arrived so far
        # (a recording's first chunk alone played as its first second)
        chunks: list[bytes] = []
        size = 0
        async for chunk in request.content.iter_chunked(64 * 1024):
            size += len(chunk)
            if size > MAX_CLIP_BYTES:
                return self.json_message(
                    "Clip too long", HTTPStatus.REQUEST_ENTITY_TOO_LARGE
                )
            chunks.append(chunk)
        data = b"".join(chunks)
        if not is_wav(data):
            return self.json_message("Not a WAV file", HTTPStatus.BAD_REQUEST)
        name = f"{uuid.uuid4().hex}.wav"
        await hass.async_add_executor_job(_write, clips_dir(hass), name, data)
        url = auth.async_sign_path(hass, f"{CLIPS_URL}/{name}", SIGNED_FOR)
        return self.json({"url": url})


class ClipView(HomeAssistantView):
    """GET a clip: by its signed URL (the speakers, the TVs) or signed in."""

    url = CLIPS_URL + "/{name}"
    name = f"api:{DOMAIN}:clip"
    requires_auth = True

    async def get(self, request: web.Request, name: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        if not CLIP_NAME.match(name):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        path = clips_dir(hass) / name
        if not await hass.async_add_executor_job(path.is_file):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.FileResponse(path, headers={"Content-Type": "audio/wav"})


@callback
def async_register_clip_views(hass: HomeAssistant) -> None:
    """Serve uploads and clips (once, at the integration's setup)."""
    hass.http.register_view(ClipUploadView())
    hass.http.register_view(ClipView())


@callback
def async_start_sweeping(hass: HomeAssistant) -> Callable[[], None]:
    """Delete old clips now and every few minutes (while the entry is loaded)."""

    async def _sweep(_now=None) -> None:
        await hass.async_add_executor_job(sweep, clips_dir(hass), CLIP_MAX_AGE)

    hass.async_create_task(_sweep())
    return async_track_time_interval(hass, _sweep, SWEEP_EVERY)
