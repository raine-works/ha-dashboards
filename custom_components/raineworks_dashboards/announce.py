"""Announcements: `raineworks_dashboards.announce`.

Speaks a message on the house's speakers (Music Assistant, one announcement per
speaker group, to its leader) and every TV that's on (Raineworks TV), in the
house's voice. Quiet hours (the House options' quiet start and end, and while
bedtime is on) keep automated ones silent; a person's own (the intercom, the
wall panel timer) pass `quiet_hours: false`. In a holiday's days its sound is the
chime, spliced in front of the speech by Chime TTS when it's installed (else the
speech is Home Assistant's own text-to-speech URL, with Music Assistant's chime).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, time
import logging
from pathlib import Path
import random
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.network import NoURLAvailableError, get_url
from homeassistant.util import dt as dt_util
import voluptuous as vol

from .const import CONF_BEDTIME_ENTITY, CONF_BEDTIME_ROOMS, CONF_HOUSE, DOMAIN
from .holidays import HOLIDAY_SOUNDS, active_holiday

_LOGGER = logging.getLogger(__name__)

SOUNDS = Path(__file__).parent / "sounds"
SOUND_NAME = r"^[a-z0-9-]+$"
DEFAULT_QUIET_START = time(22, 0)
DEFAULT_QUIET_END = time(7, 0)
NOT_THERE = ("unavailable", "unknown")

ANNOUNCE_SCHEMA = vol.Schema(
    {
        vol.Required("message"): cv.string,
        vol.Optional("speakers", default=[]): vol.Any(
            vol.All(cv.ensure_list, [cv.string]), None
        ),
        vol.Optional("volume", default=75): vol.All(
            vol.Coerce(int), vol.Range(min=0, max=100)
        ),
        vol.Optional("chime", default=True): cv.boolean,
        vol.Optional("holiday_chime", default=True): cv.boolean,
        vol.Optional("chime_sound", default=""): vol.Any(
            None, "", vol.Match(SOUND_NAME)
        ),
        vol.Optional("quiet_hours", default=True): cv.boolean,
        vol.Optional("tvs", default=True): cv.boolean,
        vol.Optional("wait", default=True): cv.boolean,
        vol.Optional("cache", default=False): cv.boolean,
    }
)


def in_quiet_hours(now: time, start: time, end: time) -> bool:
    """Whether `now` is in quiet hours from `start` to `end` (across midnight too)."""
    return start <= now < end if start <= end else now >= start or now < end


def _time(value: Any, default: time) -> time:
    try:
        return time.fromisoformat(str(value)) if value else default
    except ValueError:
        return default


def chime_path(
    sound: str | None, holiday_chime: bool, today: datetime, sounds: Path | None = None
) -> str | None:
    """The chime spliced in front of the speech: the sound asked for, else the
    holiday's (one of its clips), else none (Music Assistant's own)."""
    sounds = sounds or SOUNDS
    if sound and (sounds / f"{sound}.mp3").is_file():
        return str(sounds / f"{sound}.mp3")
    clips = HOLIDAY_SOUNDS.get(active_holiday(today.date()) or "", ())
    if holiday_chime and clips:
        clip = sounds / f"{random.choice(clips)}.mp3"
        if clip.is_file():
            return str(clip)
    return None


def resolve_speakers(hass: HomeAssistant, given: list[str]) -> list[str]:
    """Speakers by entity id or by name (Music Assistant players, any case)."""
    players = [
        s
        for s in hass.states.async_all("media_player")
        if "mass_player_type" in s.attributes
    ]
    found: list[str] = []
    for item in given:
        name = item.strip()
        ids = (
            [name]
            if name.startswith("media_player.")
            else [p.entity_id for p in players if p.name.lower() == name.lower()]
        )
        found += [i for i in ids if i not in found]
    return found


def group_leaders(hass: HomeAssistant, speakers: list[str]) -> list[str]:
    """One per Music Assistant group (its leader), the unavailable left out: an
    announcement to a member plays on the whole group."""
    leaders: list[str] = []
    for speaker in speakers:
        state = hass.states.get(speaker)
        if state is None or state.state in NOT_THERE:
            continue
        members = state.attributes.get("group_members") or []
        leader = members[0] if len(members) > 1 else speaker
        if leader not in leaders:
            leaders.append(leader)
    return leaders


def tvs_on(hass: HomeAssistant) -> list[str]:
    """Raineworks TV's TVs that are on."""
    registry = er.async_get(hass)
    return sorted(
        entry.entity_id
        for entry in registry.entities.values()
        if entry.platform == "googletv"
        and entry.domain == "media_player"
        and (state := hass.states.get(entry.entity_id))
        and state.state not in ("off", *NOT_THERE)
    )


class Announcer:
    """The house's settings, read at each announcement (options can change)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    @property
    def options(self) -> dict[str, Any]:
        entries = self.hass.config_entries.async_loaded_entries(DOMAIN)
        return dict(entries[0].options) if entries else {}

    @property
    def house(self) -> dict[str, Any]:
        return dict(self.options.get(CONF_HOUSE) or {})

    def bedtime(self) -> bool:
        options = self.options
        entity = options.get(CONF_BEDTIME_ENTITY) or (
            "switch.home_bedtime" if options.get(CONF_BEDTIME_ROOMS) else None
        )
        return bool(entity and (s := self.hass.states.get(entity)) and s.state == "on")

    def quiet(self, now: datetime) -> bool:
        house = self.house
        start = _time(house.get("quiet_start"), DEFAULT_QUIET_START)
        end = _time(house.get("quiet_end"), DEFAULT_QUIET_END)
        return in_quiet_hours(now.time(), start, end) or self.bedtime()

    def default_speakers(self) -> list[str]:
        house = self.house
        return list(house.get("announce_speakers") or []) or (
            [house["announce_speaker"]] if house.get("announce_speaker") else []
        )

    def voice(self) -> tuple[str | None, dict[str, Any]]:
        voice = self.house.get("tts") or {}
        engine = voice.get("engine") or next(
            iter(sorted(self.hass.states.async_entity_ids("tts"))), None
        )
        return engine, ({"voice": voice["voice"]} if voice.get("voice") else {})

    async def speech_url(
        self, message: str, chime: str | None, cache: bool
    ) -> str | None:
        """An absolute URL the speakers can fetch."""
        engine, options = self.voice()
        if engine is None:
            return None
        if self.hass.services.has_service("chime_tts", "say_url"):
            data: dict[str, Any] = {
                "message": message,
                "tts_platform": engine,
                "cache": cache,
                "chime_path": chime or "",
            }
            if options:
                data["options"] = options
            try:
                response = await self.hass.services.async_call(
                    "chime_tts", "say_url", data, blocking=True, return_response=True
                )
                if response and response.get("url"):
                    return str(response["url"])
            except Exception:  # Fall back to Home Assistant's own speech
                _LOGGER.warning("Chime TTS failed; plain text-to-speech", exc_info=True)
        # Loaded only to speak (Home Assistant's own text-to-speech)
        from homeassistant.components import media_source, tts  # noqa: PLC0415

        media_id = tts.generate_media_source_id(
            self.hass, message, engine=engine, options=options or None, cache=cache
        )
        resolved = await media_source.async_resolve_media(self.hass, media_id, None)
        if resolved.url.startswith("http"):
            return resolved.url
        try:
            return get_url(self.hass, prefer_external=True) + resolved.url
        except NoURLAvailableError:
            return None

    async def announce(self, data: dict[str, Any]) -> dict[str, Any]:
        now = dt_util.now()
        if data["quiet_hours"] and self.quiet(now):
            return {"skipped": "quiet_hours"}
        speakers = group_leaders(
            self.hass,
            resolve_speakers(self.hass, data["speakers"] or self.default_speakers()),
        )
        tvs = tvs_on(self.hass) if data["tvs"] else []
        if not speakers and not tvs:
            return {"skipped": "no_speakers"}
        chime = (
            chime_path(data.get("chime_sound"), data["holiday_chime"], now)
            if data["chime"]
            else None
        )
        url = await self.speech_url(data["message"], chime, data["cache"])
        if url is None:
            return {"skipped": "no_speech"}

        async def call(domain: str, service: str, payload: dict[str, Any]) -> None:
            try:
                await self.hass.services.async_call(
                    domain, service, payload, blocking=True
                )
            except Exception:  # One kind failing never stops the other
                _LOGGER.warning("%s.%s failed", domain, service, exc_info=True)

        await asyncio.gather(
            *(
                [
                    call(
                        "music_assistant",
                        "play_announcement",
                        {
                            "entity_id": speakers,
                            "url": url,
                            "announce_volume": data["volume"],
                            # The holiday's sound is in the file already
                            "use_pre_announce": data["chime"] and chime is None,
                        },
                    )
                ]
                if speakers
                else []
            ),
            *(
                [
                    call(
                        "media_player",
                        "play_media",
                        {
                            "entity_id": tvs,
                            "media_content_type": "music",
                            "media_content_id": url,
                            "announce": True,
                        },
                    )
                ]
                if tvs
                else []
            ),
        )
        return {
            "speakers": speakers,
            "tvs": tvs,
            "chime": Path(chime).stem if chime else None,
        }


@callback
def async_register_announce(hass: HomeAssistant) -> None:
    """The announce action."""
    announcer = Announcer(hass)

    async def announce(call: ServiceCall) -> dict[str, Any]:
        data = dict(call.data)
        if not data["wait"]:
            # In the background: a voice assistant answers while the speakers talk
            hass.async_create_background_task(
                announcer.announce(data), "raineworks_dashboards announce"
            )
            return {"started": True}
        return await announcer.announce(data)

    hass.services.async_register(
        DOMAIN,
        "announce",
        announce,
        schema=ANNOUNCE_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
