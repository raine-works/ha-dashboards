/**
 * The daily brief: read from its sensor (weather, events, news and the recording), the speakers
 * playing a recording of it, and how its times are written.
 *
 * @module
 */
import type { HassEntity } from '../types/homeassistant';
import { addDays, isSameDay, parseCalendarTime, startOfDay } from './calendar';
import { formatTime as time } from './time';
import { finiteNumber as num } from './values';

/**
 * The daily brief, built at 7 AM by `script.daily_brief_generate` and kept in this template sensor
 * (state = when it was built; the brief in its attributes).
 */
export const DAILY_BRIEF_ENTITY = 'sensor.daily_brief';

/** What `briefPlayback()` reads: the speakers. */
export const BRIEF_PLAYBACK_WATCH = ['media_player'] as const;

/** The day's weather, as the brief saw it. */
export interface BriefWeather {
	/** Home Assistant's condition (`sunny`, `rainy`…); empty when the brief has none. */
	condition: string;
	/** Outside, when the brief was built. */
	temperature?: number;
	/** The day's forecast high and low. */
	high?: number;
	low?: number;
	/** Chance of rain or snow, 0–100. */
	precipitationProbability?: number;
	/** The temperatures' unit ("°F" when the brief doesn't say). */
	unit: string;
}

/** One of the day's calendar events in the brief. */
export interface BriefEvent {
	summary: string;
	start: Date;
	/** Exclusive, like the calendar's. */
	end: Date;
	allDay: boolean;
	/** The calendar's name (empty when the brief doesn't say). */
	calendar: string;
	location?: string;
}

/** One story of the brief's news: a short headline (none in an older brief) over a sentence about it. */
export interface BriefStory {
	headline?: string;
	text: string;
}

/** The daily brief, read from its sensor (`toDailyBrief`). */
export interface DailyBrief {
	/** When it was built (the sensor's state). */
	generatedAt: Date;
	/** "Tuesday, October 20" */
	date: string;
	/** The spoken version (what Announce reads and the phones get). */
	summary: string;
	weather?: BriefWeather;
	/** Today's events across calendars, all-day first, then by start. */
	events: BriefEvent[];
	/** Local, national and world stories, and what's trending on X (none in a brief from before it had them). */
	news: { local: BriefStory[]; national: BriefStory[]; world: BriefStory[]; trending: BriefStory[] };
	/**
	 * The summary spoken in the house's voice, recorded once per brief by `script.daily_brief_audio` (an MP3
	 * kept in `/config/www/daily_brief` while it's the latest brief); missing until it's recorded.
	 */
	audio?: { url: string; duration?: number };
}

// A length that's missing (null reads as 0) isn't a length: a 0 would count every pause as the end
const positive = (value: unknown) => {
	const n = num(value);
	return n != null && n > 0 ? n : undefined;
};
const strings = (value: unknown) =>
	Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];

/**
 * A story as the brief stores it, "Headline | The sentence about it.", as its headline and text; one
 * without the bar (a brief from before stories had headlines) is all text.
 */
export function toBriefStory(story: string): BriefStory {
	const bar = story.indexOf('|');
	const headline = bar > 0 ? story.slice(0, bar).trim() : '';
	const text = (bar > 0 ? story.slice(bar + 1) : story).trim();
	return headline && text ? { headline, text } : { text: text || headline };
}
const stories = (value: unknown) => strings(value).map(toBriefStory);

function toWeather(value: unknown): BriefWeather | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const w = value as Record<string, unknown>;
	const weather: BriefWeather = {
		condition: typeof w.condition === 'string' ? w.condition : '',
		temperature: num(w.temperature),
		high: num(w.high),
		low: num(w.low),
		precipitationProbability: num(w.precipitation_probability),
		unit: typeof w.unit === 'string' ? w.unit : '°F',
	};
	return weather.temperature == null && weather.high == null ? undefined : weather;
}

function toEvents(value: unknown): BriefEvent[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const e = item as Record<string, unknown>;
		if (typeof e?.summary !== 'string' || typeof e.start !== 'string' || typeof e.end !== 'string') return [];
		const start = parseCalendarTime(e.start);
		const end = parseCalendarTime(e.end);
		if (Number.isNaN(start.date.getTime())) return [];
		return [
			{
				summary: e.summary,
				start: start.date,
				end: end.date,
				allDay: start.allDay,
				calendar: typeof e.calendar === 'string' ? e.calendar : '',
				location: typeof e.location === 'string' && e.location ? e.location : undefined,
			},
		];
	});
}

/** The brief from its sensor; undefined until one has been built. */
export function toDailyBrief(entity?: HassEntity): DailyBrief | undefined {
	if (!entity) return undefined;
	const generatedAt = new Date(entity.state);
	const a = entity.attributes;
	if (Number.isNaN(generatedAt.getTime()) || typeof a.summary !== 'string') return undefined;
	return {
		generatedAt,
		date: typeof a.date === 'string' ? a.date : '',
		summary: a.summary,
		weather: toWeather(a.weather),
		events: toEvents(a.events),
		news: {
			local: stories(a.local_news),
			national: stories(a.national_news),
			world: stories(a.world_news),
			trending: stories(a.x_trending),
		},
		audio:
			typeof a.audio_url === 'string' && a.audio_url
				? { url: a.audio_url, duration: positive(Number(a.audio_duration)) }
				: undefined,
	};
}

/** The brief playing (or paused) on a speaker. */
export interface BriefPlayback {
	/** The speaker (a group's leader). */
	entityId: string;
	/** The speaker's name, or the group's ("Kitchen + Library"). */
	name: string;
	state: 'playing' | 'paused';
	/** Seconds into the brief at `positionUpdatedAt` (epoch ms). */
	position?: number;
	positionUpdatedAt?: number;
	/** The recording's length in seconds, when the speaker or the brief knows it. */
	duration?: number;
}

/** The recording's file name ("<hash>.mp3"), which is what a speaker reports playing. */
export const briefAudioFile = (url: string) => url.split(/[?#]/)[0].split('/').pop() ?? '';

/**
 * Speakers with the brief's recording loaded: playing, or paused (Music Assistant's Sonos and WiiM
 * players report a pause as `idle` with the media kept). A brief that has played to its end isn't
 * playing anywhere.
 */
export function briefPlayback(
	states: Record<string, HassEntity>,
	audio: DailyBrief['audio'] | undefined,
): BriefPlayback[] {
	return recordingPlayback(states, audio && briefAudioFile(audio.url), audio?.duration);
}

/** A group as one name: "Kitchen + Library", or "Kitchen + 3 more" for a bigger one. */
function groupName(states: Record<string, HassEntity>, members: string[]): string {
	const names = members.map((id) => String(states[id]?.attributes.friendly_name ?? id));
	return names.length <= 2 ? names.join(' + ') : `${names[0]} + ${names.length - 1} more`;
}

/**
 * Speakers with a recording loaded whose content id or title includes `file` (the brief's file name,
 * or the start every scripture recording's has), as `briefPlayback()`. A group is one entry, its
 * leader's, named for the whole group: every member reports the recording, and a bar each filled the
 * dialog.
 */
export function recordingPlayback(
	states: Record<string, HassEntity>,
	file: string | undefined,
	knownDuration?: number,
): BriefPlayback[] {
	if (!file) return [];
	const loaded = recordingSpeakers(states, file, knownDuration);
	const ids = new Set(loaded.map((p) => p.entityId));
	return loaded.flatMap((p) => {
		const members = groupOf(states[p.entityId]);
		// A follower whose leader shows the group
		if (members.length > 1 && members[0] !== p.entityId && ids.has(members[0])) return [];
		return members.length > 1 && members[0] === p.entityId ? [{ ...p, name: groupName(states, members) }] : [p];
	});
}

/** A speaker's sync group, leader first (empty when it isn't grouped). */
const groupOf = (s: HassEntity | undefined): string[] =>
	Array.isArray(s?.attributes.group_members) ? s.attributes.group_members.map(String) : [];

function recordingSpeakers(states: Record<string, HassEntity>, file: string, knownDuration?: number): BriefPlayback[] {
	return Object.values(states).flatMap((s) => {
		if (!s.entity_id.startsWith('media_player.') || s.attributes.mass_player_type == null) return [];
		if (s.state !== 'playing' && s.state !== 'paused' && s.state !== 'idle') return [];
		const a = s.attributes;
		const content = [a.media_content_id, a.media_title].filter((v): v is string => typeof v === 'string');
		if (!content.some((v) => v.includes(file))) return [];
		const duration = num(a.media_duration) ?? knownDuration;
		const position = num(a.media_position);
		const updatedAt = typeof a.media_position_updated_at === 'string' ? Date.parse(a.media_position_updated_at) : NaN;
		const playing = s.state === 'playing';
		if (!playing && duration != null && position != null && position >= duration - 2) return [];
		return [
			{
				entityId: s.entity_id,
				name: a.friendly_name ?? s.entity_id,
				state: playing ? ('playing' as const) : ('paused' as const),
				position,
				positionUpdatedAt: Number.isNaN(updatedAt) ? undefined : updatedAt,
				duration,
			},
		];
	});
}

/** Seconds into the brief now (counting on from the last report while it plays). */
export function briefPosition(playback: BriefPlayback, now = Date.now()): number {
	const base = playback.position ?? 0;
	const elapsed =
		playback.state === 'playing' && playback.positionUpdatedAt ? (now - playback.positionUpdatedAt) / 1000 : 0;
	const position = base + Math.max(0, elapsed);
	return playback.duration ? Math.min(position, playback.duration) : position;
}

/** Built today (otherwise its weather, events and news are a day or more old). */
export const isBriefCurrent = (brief: DailyBrief, now = new Date()) => isSameDay(brief.generatedAt, now);

/** "8:00 AM", "Yesterday 8:00 AM", "Oct 18, 8:00 AM". */
export function formatBriefUpdated(brief: DailyBrief, now = new Date()): string {
	return formatWhen(brief.generatedAt, now);
}

/** "8:00 AM" today, "Yesterday 8:00 AM", "Oct 18, 8:00 AM". */
export function formatWhen(at: Date, now = new Date()): string {
	if (isSameDay(at, now)) return time(at);
	if (isSameDay(at, addDays(startOfDay(now), -1))) return `Yesterday ${time(at)}`;
	return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time(at)}`;
}

/** "All day", "5:00 PM – 9:00 PM", or the start alone for an event without a length. */
export function formatBriefEventTime(event: BriefEvent): string {
	if (event.allDay) return 'All day';
	return event.end > event.start ? `${time(event.start)} – ${time(event.end)}` : time(event.start);
}
