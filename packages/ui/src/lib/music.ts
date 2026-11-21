import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { houseConfig } from './house-config';
import { callForResponse } from './service-calls';
import { formatClock } from './time';
import { finiteNumber as num } from './values';

// media_player supported_features bits used by the player
export const MEDIA_FEATURE = {
	PAUSE: 1,
	SEEK: 2,
	VOLUME_SET: 4,
	VOLUME_MUTE: 8,
	PREVIOUS_TRACK: 16,
	NEXT_TRACK: 32,
	PLAY_MEDIA: 512,
	CLEAR_PLAYLIST: 8192,
	PLAY: 16384,
	SHUFFLE_SET: 32768,
	REPEAT_SET: 262144,
	GROUPING: 524288,
} as const;

export type RepeatMode = 'off' | 'all' | 'one';
export type PlaybackState = 'playing' | 'paused' | 'idle' | 'off' | 'unavailable';

export interface MusicPlayer {
	entityId: string;
	name: string;
	state: PlaybackState;
	title?: string;
	artist?: string;
	album?: string;
	/** Artwork URL (Home Assistant's proxy when available, so it works wherever HA does). */
	artwork?: string;
	/** Seconds. */
	duration?: number;
	/** 0–100. */
	volume: number;
	muted: boolean;
	shuffle: boolean;
	repeat: RepeatMode;
	/** Whole sync group, leader first (empty when not grouped). */
	groupMembers: string[];
	/** The group leader when this player follows another; its controls act on the leader. */
	leader?: string;
	/** Seconds into the track at `positionUpdatedAt` (epoch ms). */
	position?: number;
	positionUpdatedAt?: number;
	/** When the state last changed (epoch ms). */
	lastChanged?: number;
	/** Playing a live input (the turntable) instead of the queue: no seek, skip, shuffle or repeat. */
	liveInput?: LiveInput;
	/**
	 * Playing its TV's sound (a Sonos soundbar on its TV input): the TV runs playback, so nothing
	 * here can pause, skip or move it; only the volume and mute work.
	 */
	tvAudio: boolean;
	/** What it plays (music, a station, a podcast), for placeholder art when there's no cover. */
	kind: MediaKind;
	/** The playing item's URI (`media_content_id`), e.g. `spotify--x://track/…`. */
	contentId?: string;
	/**
	 * Music Assistant's queue id (`active_queue`). Empty while a live input (the turntable) plays as
	 * the speaker's source; the queue scripts then find the speaker's own from its entity.
	 */
	queueId?: string;
	features: number;
}

/**
 * A live audio input Music Assistant can play on any speaker (its Sendspin Source plugin turns a
 * Sendspin source client into one): a `<provider>://audio_source/<client id>` URI. The id comes from
 * the device's pairing key, so it stays put; a newly paired input shows its URI as the playing
 * speaker's `media_content_id` once started from Music Assistant's Browse.
 */
export interface LiveInput {
	name: string;
	uri: string;
	/** Binary sensor that's on while audio reaches the input (the record is playing). */
	signal?: string;
}

/** The house's live inputs (the house settings' `live_inputs`). */
export const liveInputs = (): LiveInput[] => houseConfig().liveInputs;

const AUDIO_SOURCE_URI = '://audio_source/';

/** The live input a player is on, from its content URI (an unknown one keeps Music Assistant's name). */
export function liveInputFor(contentId: string | undefined, title: string | undefined): LiveInput | undefined {
	if (!contentId?.includes(AUDIO_SOURCE_URI)) return undefined;
	return liveInputs().find((input) => input.uri === contentId) ?? { name: title ?? 'Live input', uri: contentId };
}

/**
 * On its TV input (a Sonos soundbar): Music Assistant reports `source: TV` / `app_id: tv` with
 * no queue (`media_title` "TV Audio", `media_content_id` `homeTheater-input`).
 */
export const isTvAudio = (a: HassEntity['attributes']) => !a.active_queue && (a.source === 'TV' || a.app_id === 'tv');

// What the TV's sound leaves the speaker (the TV pauses, skips and stops it); it can still join a
// group, which asks first (it can't lead one: `joinableSpeakers()`, the Speakers tab)
const TV_AUDIO_FEATURES = MEDIA_FEATURE.VOLUME_SET | MEDIA_FEATURE.VOLUME_MUTE | MEDIA_FEATURE.GROUPING;

// What a line-in can't do (Music Assistant still reports the queue's features while it plays)
const QUEUE_ONLY_FEATURES =
	MEDIA_FEATURE.PAUSE |
	MEDIA_FEATURE.SEEK |
	MEDIA_FEATURE.PREVIOUS_TRACK |
	MEDIA_FEATURE.NEXT_TRACK |
	MEDIA_FEATURE.CLEAR_PLAYLIST |
	MEDIA_FEATURE.SHUFFLE_SET |
	MEDIA_FEATURE.REPEAT_SET;

const STATES = new Set<PlaybackState>(['playing', 'paused', 'idle', 'off']);

/** Music Assistant's browser players: opening its web app registers that browser tab as a player. */
const BROWSER_PLAYER_MODEL = 'Web Player';

type Registries = Pick<HomeAssistant, 'entities' | 'devices'> | null | undefined;

/**
 * A real speaker to list (in the music player and the intercom): not one of Music Assistant's
 * browser players (device model "Web Player", e.g. "Web (Chrome on Mac)"), and not hidden in
 * Home Assistant (so any player can be left out by hiding its entity).
 */
export function isSpeaker(entityId: string, hass: Registries): boolean {
	const entry = hass?.entities?.[entityId];
	if (entry?.hidden) return false;
	const device = entry?.device_id ? hass?.devices?.[entry.device_id] : undefined;
	return device?.model !== BROWSER_PLAYER_MODEL;
}

/** A Music Assistant player (MA tags its entities with `mass_player_type`) that is a speaker. */
export const isMusicPlayer = (entity: HassEntity, hass?: Registries): boolean =>
	entity.entity_id.startsWith('media_player.') &&
	entity.attributes.mass_player_type !== undefined &&
	isSpeaker(entity.entity_id, hass);

/** Music Assistant's speakers, sorted by name. */
export function discoverMusicPlayers(states: Record<string, HassEntity>, hass?: Registries): MusicPlayer[] {
	return Object.values(states)
		.filter((s) => isMusicPlayer(s, hass))
		.map(toMusicPlayer)
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** A string with something in it, else undefined. */
const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

export function toMusicPlayer(entity: HassEntity): MusicPlayer {
	const a = entity.attributes;
	const members = Array.isArray(a.group_members) ? a.group_members.map(String) : [];
	const groupMembers = members.length > 1 ? members : [];
	const updated = text(a.media_position_updated_at);
	const repeat = a.repeat === 'all' || a.repeat === 'one' ? a.repeat : 'off';
	const liveInput = liveInputFor(text(a.media_content_id), text(a.media_title));
	const tvAudio = isTvAudio(a);
	const features = num(a.supported_features) ?? 0;
	return {
		entityId: entity.entity_id,
		name: text(a.friendly_name) ?? entity.entity_id.replace('media_player.', '').replace(/_/g, ' '),
		state: STATES.has(entity.state as PlaybackState) ? (entity.state as PlaybackState) : 'unavailable',
		title: tvAudio ? 'TV audio' : (liveInput?.name ?? text(a.media_title)),
		artist: text(a.media_artist),
		album: text(a.media_album_name),
		artwork: text(a.entity_picture_local) ?? text(a.entity_picture),
		duration: num(a.media_duration),
		volume: Math.round((num(a.volume_level) ?? 0) * 100),
		muted: a.is_volume_muted === true,
		shuffle: a.shuffle === true,
		repeat,
		groupMembers,
		leader: groupMembers.length > 0 && groupMembers[0] !== entity.entity_id ? groupMembers[0] : undefined,
		position: num(a.media_position),
		positionUpdatedAt: updated ? Date.parse(updated) : undefined,
		lastChanged: entity.last_changed ? Date.parse(entity.last_changed) : undefined,
		liveInput,
		tvAudio,
		kind: mediaKindOf(text(a.media_content_id)),
		contentId: text(a.media_content_id),
		queueId: text(a.active_queue),
		features: tvAudio ? features & TV_AUDIO_FEATURES : liveInput ? features & ~QUEUE_ONLY_FEATURES : features,
	};
}

export const supports = (player: Pick<MusicPlayer, 'features'>, feature: number) => (player.features & feature) !== 0;

/**
 * Played to its end: idle (or paused) within 2 seconds of the track's length. Music Assistant
 * leaves a finished track loaded, which would otherwise look paused.
 */
export const hasEnded = (player: MusicPlayer) =>
	player.state !== 'playing' &&
	player.duration !== undefined &&
	player.duration > 0 &&
	player.position !== undefined &&
	player.position >= player.duration - 2;

/**
 * A track is loaded: playing, or paused. Music Assistant's WiiM and Sonos players report a pause
 * as `idle` (keeping the track and the queue), so idle with a title counts as paused, unless it
 * played to its end.
 */
export const hasMedia = (player: MusicPlayer) =>
	(player.state === 'playing' || player.state === 'paused' || player.state === 'idle') &&
	!!player.title &&
	!hasEnded(player);

/** Paused (or stopped with the track still loaded), as the player shows it. */
export const isPaused = (player: MusicPlayer, state: PlaybackState = player.state) =>
	state !== 'playing' && hasMedia({ ...player, state });

/** How long a paused speaker stays in the now-playing indicators (cards, header, mini player). */
export const PAUSED_INDICATOR_MS = 60 * 60 * 1000;

/**
 * Worth showing on the dashboard: playing, or paused within the last hour. Never the TV's sound:
 * nothing here controls it (the TV dialog shows what's on).
 */
export function isNowPlaying(player: MusicPlayer, now = Date.now()): boolean {
	if (!hasMedia(player) || player.tvAudio) return false;
	if (player.state === 'playing') return true;
	return player.lastChanged !== undefined && now - player.lastChanged < PAUSED_INDICATOR_MS;
}

/** Every speaker (or group, by its leader) playing, or paused within the last hour: playing first. */
export function activePlayers(players: MusicPlayer[]): MusicPlayer[] {
	const active = players.filter((p) => !p.leader && isNowPlaying(p));
	return [...active.filter((p) => p.state === 'playing'), ...active.filter((p) => p.state !== 'playing')];
}

/** Seconds into the track now: the reported position plus the time since, while playing. */
export function currentPosition(player: MusicPlayer, now = Date.now()): number {
	if (player.position === undefined) return 0;
	const elapsed =
		player.state === 'playing' && player.positionUpdatedAt !== undefined ? (now - player.positionUpdatedAt) / 1000 : 0;
	const position = player.position + Math.max(0, elapsed);
	return player.duration ? Math.min(position, player.duration) : position;
}

export interface ResumePoint {
	title?: string;
	/** Seconds into the track when the move started. */
	position: number;
	/** When the move started (epoch ms). */
	at: number;
	duration?: number;
	/** Still playing: the track kept going during the move. */
	playing: boolean;
}

/** Leave this much of a track rather than seeking to its very end. */
const RESUME_END_MARGIN_S = 3;

/**
 * Where to pick a moved track back up: where it was, plus the time the move took if it was
 * playing. Undefined for live streams (no duration), the very start, or past the end.
 */
export function resumePosition(point: ResumePoint, now = Date.now()): number | undefined {
	if (!point.duration) return undefined;
	const position = point.position + (point.playing ? Math.max(0, now - point.at) / 1000 : 0);
	if (position < 1 || position > point.duration - RESUME_END_MARGIN_S) return undefined;
	return Math.round(position);
}

/** "3:07", or "1:02:03" past an hour. */
export const formatTrackTime = (seconds: number | undefined) => formatClock(seconds);

/**
 * The player to show first: the last pick if it still exists, else whatever is playing (a group
 * shows as its leader; the TV's sound doesn't count), else paused, else the first.
 */
export function defaultPlayer(players: MusicPlayer[], preferred?: string): string | undefined {
	const leaderOf = (p: MusicPlayer) => p.leader ?? p.entityId;
	if (preferred && players.some((p) => p.entityId === preferred)) return preferred;
	const music = players.filter((p) => !p.tvAudio);
	const active = music.find((p) => p.state === 'playing') ?? music.find((p) => hasMedia(p));
	return active ? leaderOf(active) : players[0]?.entityId;
}

/** A group's volume: the average of its speakers' (0–100). */
export function groupVolume(volumes: number[]): number {
	return volumes.length ? Math.round(volumes.reduce((sum, v) => sum + v, 0) / volumes.length) : 0;
}

/**
 * Each speaker's volume after moving the group volume to `target`: every speaker shifts by the same
 * amount, so their balance stays (clamped to 0–100; at 0 everything is silent).
 */
export function applyGroupVolume(volumes: number[], target: number): number[] {
	if (target <= 0) return volumes.map(() => 0);
	const delta = target - groupVolume(volumes);
	return volumes.map((v) => Math.min(100, Math.max(0, Math.round(v + delta))));
}

/** Speakers playing along with another (every group's followers): ungrouping them splits every group. */
export const groupFollowers = (players: MusicPlayer[]): string[] =>
	players.filter((p) => p.leader).map((p) => p.entityId);

/**
 * The speakers "Join all" adds to `leader`'s group: every other available speaker that can group
 * and isn't in it yet (one in another group moves over), never one playing its TV's sound.
 */
export function joinableSpeakers(leader: MusicPlayer, players: MusicPlayer[]): string[] {
	if (!supports(leader, MEDIA_FEATURE.GROUPING) || leader.tvAudio) return [];
	return players
		.filter(
			(p) =>
				p.entityId !== leader.entityId &&
				p.state !== 'unavailable' &&
				supports(p, MEDIA_FEATURE.GROUPING) &&
				// Never in bulk over someone watching TV (its own switch asks)
				!p.tvAudio &&
				!leader.groupMembers.includes(p.entityId),
		)
		.map((p) => p.entityId);
}

/** "Library + Kitchen", or the one speaker's name. */
export function speakerNames(player: MusicPlayer, players: MusicPlayer[]): string {
	const ids = player.groupMembers.length > 0 ? player.groupMembers : [player.entityId];
	return ids.map((id) => players.find((p) => p.entityId === id)?.name ?? id).join(' + ');
}

/** Search results by exactly this artist (MA's artist filter is fuzzy: "Knox" also finds "Knox Hamilton"). */
export function byArtist(items: MediaItem[], artist: string): MediaItem[] {
	const name = artist.toLowerCase();
	return items.filter((item) => item.artists?.some((a) => a.toLowerCase() === name));
}

/** Next repeat mode when the repeat button is tapped: off → all → one → off. */
export const nextRepeat = (mode: RepeatMode): RepeatMode => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off');

// --- Music Assistant library ------------------------------------------------------------------

export type MediaType = 'artist' | 'album' | 'track' | 'playlist' | 'radio' | 'podcast';

/** What something plays: music, a radio station, a podcast, or the spoken daily brief (or scripture). */
export type MediaKind = 'music' | 'radio' | 'podcast' | 'brief';

/**
 * Where the daily brief's recording (`script.daily_brief_audio`) and the scripture's
 * (`script.daily_scripture_audio`) are served from; Music Assistant plays them as
 * `builtin://track/<url>`.
 */
export const DAILY_BRIEF_AUDIO_PATH = '/local/daily_brief/';

/** The kind of a media type or URI (`library://radio/1`, `spotify--x://podcast_episode/…`). */
export function mediaKindOf(typeOrUri: string | undefined): MediaKind {
	if (!typeOrUri) return 'music';
	if (typeOrUri.includes(DAILY_BRIEF_AUDIO_PATH)) return 'brief';
	if (typeOrUri === 'radio' || typeOrUri.includes('://radio/')) return 'radio';
	if (typeOrUri === 'podcast' || typeOrUri === 'podcast_episode' || typeOrUri.includes('://podcast')) return 'podcast';
	return 'music';
}

export interface MediaItem {
	/** A podcast's episode is played (and queued) but never browsed or searched for. */
	mediaType: MediaType | 'podcast_episode';
	uri: string;
	name: string;
	/** Artists, or the album for a track without artists. */
	subtitle?: string;
	artists?: string[];
	image?: string;
}

interface RawMediaItem {
	media_type?: string;
	uri?: string;
	name?: string;
	image?: string | null;
	artists?: { name?: string; uri?: string; image?: string | null }[];
	album?: { name?: string; uri?: string; image?: string | null; artists?: { name?: string }[] } | null;
}

const MEDIA_TYPES = new Set<MediaType>(['artist', 'album', 'track', 'playlist', 'radio', 'podcast']);

/** MA's item shape → MediaItem (unknown types and items without a URI are dropped). */
export function toMediaItems(raw: unknown): MediaItem[] {
	if (!Array.isArray(raw)) return [];
	return (raw as RawMediaItem[]).flatMap((item) => {
		const mediaType = item.media_type as MediaType;
		if (!item.uri || !item.name || !MEDIA_TYPES.has(mediaType)) return [];
		const artists = (item.artists ?? []).flatMap((a) => (a.name ? [a.name] : []));
		return [
			{
				mediaType,
				uri: item.uri,
				name: item.name,
				subtitle: artists.length > 0 ? artists.join(', ') : (item.album?.name ?? undefined),
				artists: artists.length > 0 ? artists : undefined,
				image: item.image ?? undefined,
			},
		];
	});
}

export interface SearchResults {
	artists: MediaItem[];
	albums: MediaItem[];
	tracks: MediaItem[];
	playlists: MediaItem[];
	radio: MediaItem[];
	podcasts: MediaItem[];
}

export function toSearchResults(raw: unknown): SearchResults {
	const r = (raw ?? {}) as Record<string, unknown>;
	return {
		artists: toMediaItems(r.artists),
		albums: toMediaItems(r.albums),
		tracks: toMediaItems(r.tracks),
		playlists: toMediaItems(r.playlists),
		radio: toMediaItems(r.radio),
		podcasts: toMediaItems(r.podcasts),
	};
}

export interface QueueItem {
	/** Music Assistant's queue item id (the same song queued twice has two). */
	id?: string;
	name: string;
	artist?: string;
	image?: string;
	duration?: number;
	/** Its artists and album, to open their pages (Music Assistant gives their URIs). */
	artistItems?: MediaItem[];
	albumItem?: MediaItem;
}

export interface QueueSummary {
	/** Items in the queue. */
	count: number;
	current?: QueueItem;
	next?: QueueItem;
}

interface RawQueueItem {
	queue_item_id?: string;
	name?: string;
	duration?: number;
	media_item?: RawMediaItem | null;
}

function toQueueItem(raw: RawQueueItem | null | undefined): QueueItem | undefined {
	if (!raw) return undefined;
	const media = raw.media_item;
	const artists = (media?.artists ?? []).map((a) => a.name).filter(Boolean);
	const artistItems = (media?.artists ?? []).flatMap((a) =>
		a.uri && a.name ? [{ mediaType: 'artist' as const, uri: a.uri, name: a.name, image: a.image ?? undefined }] : [],
	);
	const album = media?.album;
	const albumArtists = (album?.artists ?? []).flatMap((a) => (a.name ? [a.name] : []));
	return {
		name: media?.name ?? raw.name ?? 'Unknown',
		artist: artists.length > 0 ? artists.join(', ') : undefined,
		image: media?.image ?? media?.album?.image ?? undefined,
		duration: raw.duration,
		...(raw.queue_item_id ? { id: raw.queue_item_id } : {}),
		...(artistItems.length > 0 ? { artistItems } : {}),
		...(album?.uri && album.name
			? {
					albumItem: {
						mediaType: 'album' as const,
						uri: album.uri,
						name: album.name,
						subtitle: albumArtists.length > 0 ? albumArtists.join(', ') : undefined,
						artists: albumArtists.length > 0 ? albumArtists : undefined,
						image: album.image ?? undefined,
					},
				}
			: {}),
	};
}

/** `music_assistant.get_queue`'s response for one player (MA exposes current and next only). */
export function toQueueSummary(raw: unknown, entityId: string): QueueSummary | undefined {
	const queue = (raw as Record<string, Record<string, unknown>> | undefined)?.[entityId];
	if (!queue) return undefined;
	return {
		count: typeof queue.items === 'number' ? queue.items : 0,
		current: toQueueItem(queue.current_item as RawQueueItem),
		next: toQueueItem(queue.next_item as RawQueueItem),
	};
}

type Hass = Pick<HomeAssistant, 'callWS'> & Partial<Pick<HomeAssistant, 'config' | 'services' | 'states' | 'entities'>>;

/**
 * Music Assistant's integration has raine-works' actions (raine-works/ha-music-assistant: the whole
 * queue and its edits, podcast episodes, the Party link), over its own connection; without them the
 * Queue tab, podcast episodes and the Party link aren't there (the built-in integration has no way).
 */
export const hasMusicActions = (hass: Pick<HomeAssistant, 'services'> | Partial<Pick<HomeAssistant, 'services'>>) =>
	!!hass.services?.music_assistant?.get_queue_items;

/** A service call that answers nothing, over the websocket (rejects when Home Assistant refuses). */
const callAction = (hass: Hass, domain: string, service: string, data: Record<string, unknown>) => {
	if (!hass.callWS) throw new Error('Home Assistant connection not ready');
	return hass.callWS({ type: 'call_service', domain, service, service_data: data });
};

/** A Music Assistant service that returns data (search, library, queue). */
const callMusicAssistant = (
	hass: Hass,
	service: string,
	serviceData: Record<string, unknown>,
	target?: Record<string, unknown>,
) => callForResponse(hass, 'music_assistant', service, serviceData, target);

/**
 * Music Assistant's config entry, which search and library calls need. Read from a player's
 * registry entry (open to every user), falling back to the config entries list (admins).
 */
export async function findMusicConfigEntry(hass: Hass, playerEntityId?: string): Promise<string | undefined> {
	if (!hass.callWS) return undefined;
	// The integration answers any user who may read the player; Home Assistant's own lookups below
	// are for admins only
	if (playerEntityId && hass.config?.components?.includes('raineworks_dashboards')) {
		try {
			const entry = await hass.callWS<{ config_entry_id?: string | null }>({
				type: 'raineworks_dashboards/config_entry',
				entity_id: playerEntityId,
			});
			if (entry?.config_entry_id) return entry.config_entry_id;
		} catch {}
	}
	if (playerEntityId) {
		try {
			const entry = await hass.callWS<{ config_entry_id?: string }>({
				type: 'config/entity_registry/get',
				entity_id: playerEntityId,
			});
			if (entry?.config_entry_id) return entry.config_entry_id;
		} catch {}
	}
	try {
		const entries = await hass.callWS<{ entry_id: string; state?: string }[]>({
			type: 'config_entries/get',
			domain: 'music_assistant',
		});
		return (entries.find((e) => e.state === 'loaded') ?? entries[0])?.entry_id;
	} catch {
		return undefined;
	}
}

export async function searchMusic(
	hass: Hass,
	configEntryId: string,
	query: string,
	types?: MediaType[],
	filters: { artist?: string } = {},
) {
	const data: Record<string, unknown> = { config_entry_id: configEntryId, name: query };
	if (types?.length) data.media_type = types;
	if (filters.artist) data.artist = filters.artist;
	return toSearchResults(await callMusicAssistant(hass, 'search', data));
}

export async function getLibrary(
	hass: Hass,
	configEntryId: string,
	mediaType: MediaType,
	options: { favorite?: boolean; orderBy?: string } = {},
): Promise<MediaItem[]> {
	const data: Record<string, unknown> = { config_entry_id: configEntryId, media_type: mediaType };
	if (options.favorite) data.favorite = true;
	if (options.orderBy) data.order_by = options.orderBy;
	const response = (await callMusicAssistant(hass, 'get_library', data)) as { items?: unknown } | undefined;
	return toMediaItems(response?.items);
}

/** A node of Home Assistant's media browser (`media_player/browse_media`). */
interface BrowseNode {
	title?: string;
	media_content_id?: string;
	media_class?: string;
	can_play?: boolean;
	thumbnail?: string | null;
	children?: BrowseNode[];
}

/**
 * An album's or playlist's tracks, in order, from its media browser node. Their titles read "Artist -
 * Title": the album's artist (else everything before the first " - ") is split off as the subtitle.
 */
export function toTracks(node: unknown, albumArtist?: string): MediaItem[] {
	const children = (node as BrowseNode | undefined)?.children ?? [];
	return children.flatMap((child) => {
		if (child.media_class !== 'track' || !child.media_content_id || !child.title) return [];
		const prefix = albumArtist ? `${albumArtist} - ` : '';
		let name = child.title;
		let artist: string | undefined;
		if (prefix && name.startsWith(prefix)) {
			artist = albumArtist;
			name = name.slice(prefix.length);
		} else if (name.includes(' - ')) {
			artist = name.slice(0, name.indexOf(' - '));
			name = name.slice(name.indexOf(' - ') + 3);
		}
		return [
			{
				mediaType: 'track' as const,
				uri: child.media_content_id,
				name,
				subtitle: artist,
				artists: artist ? [artist] : undefined,
				image: child.thumbnail ?? undefined,
			},
		];
	});
}

/**
 * An album's or playlist's tracks through a Music Assistant player's media browser (MA's services
 * don't list them).
 */
export async function getTracks(hass: Hass, playerEntityId: string, item: MediaItem): Promise<MediaItem[]> {
	const node = await hass.callWS?.({
		type: 'media_player/browse_media',
		entity_id: playerEntityId,
		media_content_id: item.uri,
		media_content_type: item.mediaType,
	});
	return toTracks(node, item.mediaType === 'album' ? item.artists?.[0] : undefined);
}

/**
 * Whether the playing track is one of a list's tracks: by URI, else by title (a library track can
 * play under its provider's URI).
 */
export function hasTrack(tracks: MediaItem[], playing: Pick<MusicPlayer, 'contentId' | 'title'>): boolean {
	return tracks.some(
		(t) => (!!playing.contentId && t.uri === playing.contentId) || (!!playing.title && t.name === playing.title),
	);
}

/**
 * Has the queue caught up with the playing track? Right after a skip Music Assistant's queue can
 * still have the previous track as current, and for about a second after that its next item is
 * still the current one (the same queue item). A queue item without a media item is named
 * "Artist - Title".
 */
export function queueIsCurrent(queue: QueueSummary | undefined, title: string | undefined): boolean {
	const current = queue?.current;
	if (!current || !title) return true;
	if (current.name !== title && !current.name.endsWith(` - ${title}`)) return false;
	return !current.id || current.id !== queue.next?.id;
}

export async function getQueue(hass: Hass, entityId: string): Promise<QueueSummary | undefined> {
	return toQueueSummary(await callMusicAssistant(hass, 'get_queue', {}, { entity_id: entityId }), entityId);
}

/** Music Assistant's Party guest join link (`music_assistant.get_party_url`); `url` is null while guest access is off. */
export interface PartyLink {
	url: string | null;
	/** 200 when Music Assistant answered; 0 when it couldn't be asked (no raine-works/ha-music-assistant). */
	status: number;
}

/** A TV Music Assistant can cast its Party Dashboard to (lyrics and the join QR code). */
export interface PartyTv {
	id: string;
	name: string;
	/** Showing the Party Dashboard now. */
	showing: boolean;
}

export async function getPartyLink(hass: Hass): Promise<PartyLink> {
	if (hasMusicActions(hass)) {
		const response = await callForResponse<{ url?: unknown }>(hass, 'music_assistant', 'get_party_url');
		const url = response?.url;
		return { url: typeof url === 'string' && url.startsWith('http') ? url : null, status: 200 };
	}
	return { url: null, status: 0 };
}

/**
 * The TVs for the Party Dashboard from Music Assistant's display media players (the built-in
 * integration's: `music_assistant` entities with device class tv, each a display it can cast to),
 * by name; `tvNames` keeps those named as one of the house's TVs (Music Assistant counts some audio
 * receivers as displays). A display shows the Party Dashboard while it's playing `party`.
 */
export function partyDisplays(
	hass: Pick<HomeAssistant, 'states' | 'entities'>,
	tvNames: ReadonlySet<string>,
): PartyTv[] {
	return Object.values(hass.entities ?? {})
		.filter((e) => e.platform === 'music_assistant' && e.entity_id.startsWith('media_player.') && !e.hidden)
		.flatMap((e) => {
			const state = hass.states[e.entity_id];
			const name = text(state?.attributes.friendly_name) ?? e.entity_id;
			if (state?.attributes.device_class !== 'tv' || !tvNames.has(name)) return [];
			const showing = state.state === 'playing' && state.attributes.media_content_id === 'party';
			return [{ id: e.entity_id, name, showing }];
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPartyTvs(hass: Hass, tvNames: ReadonlySet<string> = new Set()): Promise<PartyTv[]> {
	return hass.states ? partyDisplays({ states: hass.states, entities: hass.entities }, tvNames) : [];
}

/**
 * Show (or hide) the Party Dashboard on one TV: its display media player (`media_player.play_media`
 * with content type dashboard and id party; `turn_off` hides it); rejects when Music Assistant refuses.
 */
export async function castParty(hass: Hass, tv: string, show: boolean): Promise<void> {
	await (show
		? callAction(hass, 'media_player', 'play_media', {
				entity_id: tv,
				media_content_type: 'dashboard',
				media_content_id: 'party',
			})
		: callAction(hass, 'media_player', 'turn_off', { entity_id: tv }));
}

/** One song in a speaker's whole queue (`music_assistant.get_queue_items`). */
export interface QueueEntry {
	/** Music Assistant's queue_item_id, for playing from it, moving and removing it. */
	id: string;
	/** Its place in the queue (0 = the first item, played or not). */
	index: number;
	name: string;
	artist?: string;
	album?: string;
	duration?: number;
	image?: string;
	uri?: string;
}

/** A page of a speaker's whole queue, from Music Assistant through Home Assistant. */
export interface QueuePage {
	/** The playing item's place in the queue. */
	currentIndex: number;
	/** Items in the whole queue, played ones included. */
	total: number;
	/** The first entry's index. */
	offset: number;
	entries: QueueEntry[];
	/** The playlist or album the queue was started from. */
	source?: MediaItem;
}

const count = (v: unknown, fallback = 0) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
};

export function toQueuePage(response: unknown): QueuePage | undefined {
	const r = response as Record<string, unknown> | undefined;
	if (!r || Number(r.status) !== 200) return undefined;
	const entries = (Array.isArray(r.items) ? r.items : []).flatMap((raw): QueueEntry[] => {
		const item = raw as Record<string, unknown>;
		const id = text(item?.id);
		if (!id) return [];
		return [
			{
				id,
				index: count(item.index),
				name: text(item.name) ?? 'Unknown',
				artist: text(item.artist),
				album: text(item.album),
				duration: Number(item.duration) > 0 ? Number(item.duration) : undefined,
				image: text(item.image),
				uri: text(item.uri),
			},
		];
	});
	const rawSource = r.source as Record<string, unknown> | null | undefined;
	const sourceType = rawSource ? text(rawSource.media_type) : undefined;
	const sourceUri = rawSource ? text(rawSource.uri) : undefined;
	return {
		currentIndex: count(r.current_index),
		total: count(r.total),
		offset: count(r.offset),
		entries,
		source:
			rawSource && sourceUri && sourceType && MEDIA_TYPES.has(sourceType as MediaType)
				? {
						mediaType: sourceType as MediaType,
						uri: sourceUri,
						name: text(rawSource.name) ?? 'Unknown',
						image: text(rawSource.image),
					}
				: undefined,
	};
}

/**
 * A page of the speaker's whole queue, from `offset` (default: the playing item). Found by its
 * entity too, so it works while a live input plays (when `active_queue` is empty).
 */
export async function getQueuePage(
	hass: Hass,
	speaker: Pick<MusicPlayer, 'entityId' | 'queueId'>,
	options: { offset?: number; limit?: number } = {},
): Promise<QueuePage | undefined> {
	if (!hasMusicActions(hass)) return undefined;
	const paging: Record<string, unknown> = {};
	if (options.offset !== undefined) paging.offset = options.offset;
	if (options.limit !== undefined) paging.limit = options.limit;
	const response = await callForResponse<Record<string, unknown>>(hass, 'music_assistant', 'get_queue_items', paging, {
		entity_id: speaker.entityId,
	});
	const page = response?.[speaker.entityId];
	return toQueuePage(page && typeof page === 'object' ? { status: 200, ...page } : undefined);
}

export type QueueEdit =
	| { action: 'play' }
	| { action: 'remove' }
	| { action: 'move'; shift: number }
	/** Back to the queue where it was parked (after a live input, the turntable); no entry. */
	| { action: 'resume' };

/** Play from, move or remove a queue entry (`music_assistant.edit_queue`); rejects when Music Assistant refuses. */
export async function editQueue(
	hass: Hass,
	speaker: Pick<MusicPlayer, 'entityId' | 'queueId'>,
	entry: string,
	edit: QueueEdit,
): Promise<void> {
	if (!hasMusicActions(hass)) throw new Error('Needs the raine-works Music Assistant integration');
	await callAction(hass, 'music_assistant', 'edit_queue', {
		entity_id: speaker.entityId,
		action: edit.action,
		...(edit.action === 'resume' ? {} : { item: entry }),
		...(edit.action === 'move' ? { shift: edit.shift } : {}),
	});
}

/**
 * The entries after a local edit, before Music Assistant's queue is read again (so a row moves or
 * goes at once): `move` shifts it `shift` places (0 = right after the playing one), indexes follow.
 */
export function applyQueueEdit(entries: QueueEntry[], id: string, edit: QueueEdit, currentIndex: number): QueueEntry[] {
	const from = entries.findIndex((e) => e.id === id);
	if (from < 0 || edit.action === 'play' || edit.action === 'resume') return entries;
	const next = [...entries];
	const [moved] = next.splice(from, 1);
	if (edit.action === 'move') {
		const current = next.findIndex((e) => e.index === currentIndex);
		const to = edit.shift === 0 ? current + 1 : Math.min(next.length, Math.max(current + 1, from + edit.shift));
		next.splice(to, 0, moved);
	}
	const base = entries[0]?.index ?? 0;
	return next.map((e, i) => (e.index === base + i ? e : { ...e, index: base + i }));
}

/** One of a podcast's episodes (`music_assistant.get_podcast_episodes`). */
export interface PodcastEpisode {
	uri: string;
	name: string;
	/** When it came out (ISO). */
	released?: string;
	/** Seconds. */
	duration?: number;
	/** Where the listener left off, in seconds (0 = not started). */
	resume: number;
	played: boolean;
	/** Its show notes as plain text, cut short. */
	description?: string;
	image?: string;
}

/** A page of a podcast's episodes, newest first. */
export interface EpisodePage {
	total: number;
	offset: number;
	episodes: PodcastEpisode[];
}

export function toEpisodePage(response: unknown): EpisodePage | undefined {
	const r = response as Record<string, unknown> | undefined;
	if (!r || Number(r.status) !== 200) return undefined;
	const episodes = (Array.isArray(r.episodes) ? r.episodes : []).flatMap((raw): PodcastEpisode[] => {
		const item = raw as Record<string, unknown>;
		const uri = text(item?.uri);
		if (!uri) return [];
		const duration = count(item.duration);
		const resume = count(item.resume);
		return [
			{
				uri,
				name: text(item.name) ?? 'Untitled episode',
				released: text(item.released),
				duration: duration > 0 ? duration : undefined,
				resume: resume > 0 ? resume : 0,
				played: item.played === true,
				description: text(item.description),
				image: text(item.image),
			},
		];
	});
	return { total: count(r.total, episodes.length), offset: count(r.offset), episodes };
}

/**
 * The next page added to the episodes shown (Show more). By uri, once each: an episode published
 * since the last page shifts the list, so the next one starts with an episode already shown.
 */
export function appendEpisodes(shown: EpisodePage, next: EpisodePage): EpisodePage {
	const uris = new Set(shown.episodes.map((e) => e.uri));
	return { ...next, offset: 0, episodes: [...shown.episodes, ...next.episodes.filter((e) => !uris.has(e.uri))] };
}

/**
 * A page of a podcast's episodes, newest first, from Music Assistant (Home Assistant's media
 * browser doesn't expand a podcast); undefined when Music Assistant couldn't be asked.
 */
export async function getPodcastEpisodes(
	hass: Hass,
	podcast: Pick<MediaItem, 'uri'>,
	options: { offset?: number; limit?: number } = {},
): Promise<EpisodePage | undefined> {
	const data: Record<string, unknown> = { uri: podcast.uri };
	if (options.offset !== undefined) data.offset = options.offset;
	if (options.limit !== undefined) data.limit = options.limit;
	if (!hasMusicActions(hass)) return undefined;
	const page = await callForResponse<Record<string, unknown>>(hass, 'music_assistant', 'get_podcast_episodes', data);
	return toEpisodePage(page ? { status: 200, ...page } : undefined);
}

/** An episode as something to play or queue, with the podcast's cover when it has none of its own. */
export const episodeItem = (episode: PodcastEpisode, podcast: MediaItem): MediaItem => ({
	mediaType: 'podcast_episode',
	uri: episode.uri,
	name: episode.name,
	subtitle: podcast.name,
	image: episode.image ?? podcast.image,
});

/** "Oct 24", or "Oct 24, 2025" from another year. */
export function formatEpisodeDate(iso: string | undefined, now = new Date()): string | undefined {
	if (!iso) return undefined;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
	});
}

/** "45 min", "1 hr 5 min"; under a minute counts as one. */
export function formatEpisodeLength(seconds: number): string {
	const minutes = Math.max(1, Math.round(seconds / 60));
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/**
 * How far along an episode is: "Played", "12 min left" once started, else its length; `progress`
 * (0–1) only while it's started and not done.
 */
export function episodeProgress(episode: Pick<PodcastEpisode, 'duration' | 'resume' | 'played'>): {
	label?: string;
	progress?: number;
} {
	if (episode.played) return { label: 'Played' };
	const { duration, resume } = episode;
	if (!duration) return {};
	if (resume > 0 && resume < duration) {
		return { label: `${formatEpisodeLength(duration - resume)} left`, progress: resume / duration };
	}
	return { label: formatEpisodeLength(duration) };
}

// Spotify's Liked Songs art comes from Music Assistant as its 64px version (other covers are 640px).
// A browser that draws an image at its own size (the wall panels') showed it smaller than the rest.
const SPOTIFY_LIKED_SONGS = /^(https:\/\/misc\.scdn\.co\/liked-songs\/liked-songs-)\d+(\.png)$/;

/** A cover at the size the others come in: Spotify's Liked Songs art at 640px instead of 64. */
export function fullSizeCover(src: string | undefined): string | undefined {
	return src?.replace(SPOTIFY_LIKED_SONGS, '$1640$2');
}
