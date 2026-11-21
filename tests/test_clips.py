"""Voice clips: any signed-in user uploads one; speakers fetch it by its signed URL."""

from datetime import timedelta
from http import HTTPStatus
import os
from pathlib import Path
import struct
import time

from homeassistant.core import HomeAssistant

from custom_components.raineworks_dashboards import clips


def wav(size: int = 100) -> bytes:
    """A minimal RIFF WAVE file with `size` bytes of silence."""
    fmt = struct.pack("<HHIIHH", 1, 1, 16000, 32000, 2, 16)
    data = b"\0" * size
    body = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt
    body += b"data" + struct.pack("<I", len(data)) + data
    return b"RIFF" + struct.pack("<I", len(body)) + body


async def test_upload_then_fetch_by_the_signed_url(
    hass: HomeAssistant, hass_client, hass_client_no_auth, setup
) -> None:
    await setup()
    client = await hass_client()
    response = await client.post(
        clips.CLIPS_URL, data=wav(), headers={"Content-Type": "audio/wav"}
    )
    assert response.status == HTTPStatus.OK
    url = (await response.json())["url"]
    assert url.startswith(f"{clips.CLIPS_URL}/") and "authSig=" in url

    # Music Assistant, a TV: no token, just the signed URL
    anonymous = await hass_client_no_auth()
    fetched = await anonymous.get(url)
    assert fetched.status == HTTPStatus.OK
    assert await fetched.read() == wav()
    # Without the signature it's refused
    unsigned = await anonymous.get(url.split("?")[0])
    assert unsigned.status == HTTPStatus.UNAUTHORIZED


async def test_refuses_what_isnt_a_clip(
    hass: HomeAssistant, hass_client, setup
) -> None:
    await setup()
    client = await hass_client()
    not_wav = await client.post(clips.CLIPS_URL, data=b"<script>" * 20)
    assert not_wav.status == HTTPStatus.BAD_REQUEST
    too_big = await client.post(clips.CLIPS_URL, data=wav(clips.MAX_CLIP_BYTES))
    assert too_big.status == HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    # Names other than an upload's own are never served (no path tricks)
    other = await client.get(f"{clips.CLIPS_URL}/notes.txt")
    assert other.status == HTTPStatus.NOT_FOUND
    # Home Assistant's own filter stops a traversal before it reaches the view
    odd = await client.get(f"{clips.CLIPS_URL}/..%2Fsecrets.yaml")
    assert odd.status in (HTTPStatus.BAD_REQUEST, HTTPStatus.NOT_FOUND)


async def test_uploading_needs_a_signed_in_user(
    hass: HomeAssistant, hass_client_no_auth, setup
) -> None:
    await setup()
    anonymous = await hass_client_no_auth()
    response = await anonymous.post(clips.CLIPS_URL, data=wav())
    assert response.status == HTTPStatus.UNAUTHORIZED


def test_sweep_removes_only_old_clips(tmp_path: Path) -> None:
    old = tmp_path / f"{'a' * 32}.wav"
    new = tmp_path / f"{'b' * 32}.wav"
    other = tmp_path / "notes.txt"
    for f in (old, new, other):
        f.write_bytes(b"x")
    an_hour_ago = time.time() - 3600
    os.utime(old, (an_hour_ago, an_hour_ago))
    os.utime(other, (an_hour_ago, an_hour_ago))
    assert clips.sweep(tmp_path, timedelta(minutes=10)) == 1
    assert sorted(p.name for p in tmp_path.iterdir()) == [new.name, "notes.txt"]
    assert clips.sweep(tmp_path / "missing", timedelta(minutes=10)) == 0


async def test_a_whole_recording_is_kept(
    hass: HomeAssistant, hass_client, hass_client_no_auth, setup
) -> None:
    """A real recording arrives in several chunks; all of it is stored."""
    await setup()
    client = await hass_client()
    recording = wav(2 * 1024 * 1024)
    response = await client.post(clips.CLIPS_URL, data=recording)
    url = (await response.json())["url"]
    fetched = await (await hass_client_no_auth()).get(url)
    assert len(await fetched.read()) == len(recording)
