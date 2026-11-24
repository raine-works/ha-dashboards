/**
 * UniFi Protect event clips, as its Home Assistant media source browses them:
 *
 * ```text
 * media-source://unifiprotect                   the NVR (`<nvr>:browse`), children are its cameras
 * <nvr>:browse:<camera>                         the camera's event types (all, ring, motion, smart, audio)
 * <nvr>:browse:<camera>:<type>:recent:<days>    its events from the last 1, 7 or 30 days, newest first
 * <nvr>:event:<event id>                        one clip: `media_source/resolve_media` gives a signed MP4 URL
 * ```
 *
 * @module
 */
import { cameraPrefix } from './cameras';
import { capitalize } from './text';
import { dayKey, formatClock, pad2 } from './time';

/** The UniFi Protect media source's root, whose children are the NVRs. */
export const PROTECT_ROOT = 'media-source://unifiprotect';

/** What a clip's event was, for its icon. */
export type ClipKind = 'ring' | 'person' | 'vehicle' | 'animal' | 'package' | 'face' | 'motion' | 'audio' | 'other';

/** One event clip of a camera. */
export interface Clip {
	/** Media source id to resolve for playback. */
	id: string;
	/** Event time, as Home Assistant's clock shows it. */
	start: Date;
	/** Seconds (0 when the title doesn't say). */
	duration: number;
	kind: ClipKind;
	/** What was detected: "Person", "Ring", "Motion", "Speech". */
	label: string;
	/** Thumbnail path on Home Assistant (needs a signed path or auth to load). */
	thumbnail?: string;
}

/** Event types a camera's clips can be filtered to (doorbells add rings, AI cameras audio). */
export type ClipFilter = 'all' | 'ring' | 'smart' | 'motion' | 'audio';
/** Every event-type filter with its label, in the order the clip list offers them. */
export const CLIP_FILTERS: { id: ClipFilter; label: string }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'ring', label: 'Rings' },
	{ id: 'smart', label: 'Objects' },
	{ id: 'motion', label: 'Motion' },
	{ id: 'audio', label: 'Audio' },
];

/** How many days back the clip list reaches (Protect's `recent:<days>`). */
export type ClipRange = 1 | 7 | 30;
/** Every range with its label, shortest first. */
export const CLIP_RANGES: { days: ClipRange; label: string }[] = [
	{ days: 1, label: '24 hours' },
	{ days: 7, label: '7 days' },
	{ days: 30, label: '30 days' },
];

/** A media source browse item (`media_source/browse_media`), as much of it as the clips read. */
export interface BrowseItem {
	title: string;
	media_content_id: string;
	can_play?: boolean;
	thumbnail?: string | null;
	children?: BrowseItem[];
}

const SMART_KINDS: Record<string, ClipKind> = {
	person: 'person',
	vehicle: 'vehicle',
	animal: 'animal',
	package: 'package',
	face: 'face',
	'license plate': 'vehicle',
	licenseplate: 'vehicle',
};

const AUDIO_LABELS: Record<string, string> = { speak: 'Speech' };

const TITLE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}) (\d{1,2}):(\d{2}):(\d{2})\s+((?:\d+[hms]\s*)+)\s+(.+)$/;

/** Seconds in "1h 2m 3s" / "1m 56s" / "10s". */
function parseDuration(text: string): number {
	let seconds = 0;
	for (const [, value, unit] of text.matchAll(/(\d+)([hms])/g))
		seconds += Number(value) * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1);
	return seconds;
}

/** What an event title's type names: "Ring Event", "Object Detection - Person", "Audio Detection - Speak". */
function parseKind(type: string): { kind: ClipKind; label: string } {
	const lower = type.toLowerCase();
	if (lower.startsWith('ring')) return { kind: 'ring', label: 'Ring' };
	if (lower.startsWith('motion')) return { kind: 'motion', label: 'Motion' };
	const detail = type.split(' - ')[1]?.trim();
	if (lower.startsWith('audio')) {
		const sound = detail?.toLowerCase() ?? '';
		return { kind: 'audio', label: AUDIO_LABELS[sound] ?? (detail ? capitalize(detail) : 'Audio') };
	}
	if (lower.startsWith('object') || lower.startsWith('smart')) {
		// Several objects ("Person, Vehicle"): the first one names it
		const first = detail?.split(',')[0]?.trim() ?? '';
		return { kind: SMART_KINDS[first.toLowerCase()] ?? 'other', label: first ? capitalize(first) : 'Object' };
	}
	return { kind: 'other', label: type };
}

/**
 * A clip from a browse item titled like `10/18/26 21:24:12 37s Object Detection - Person` (the
 * time is Home Assistant's local time). Undefined for anything that isn't a playable event.
 */
export function toClip(item: BrowseItem): Clip | undefined {
	if (!item.can_play || !item.media_content_id.includes(':event:')) return undefined;
	const match = TITLE.exec(item.title.trim());
	if (!match) return undefined;
	const [, month, day, year, hour, minute, second, duration, type] = match;
	const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
	return {
		id: item.media_content_id,
		start: new Date(fullYear, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
		duration: parseDuration(duration),
		...parseKind(type),
		thumbnail: item.thumbnail ?? undefined,
	};
}

/** The clips in a browse listing, newest first. */
export function toClips(listing: BrowseItem | undefined): Clip[] {
	return (listing?.children ?? [])
		.map(toClip)
		.filter((clip): clip is Clip => !!clip)
		.sort((a, b) => b.start.getTime() - a.start.getTime());
}

/**
 * The Protect browse id of a dashboard camera (by its entity prefix): the NVR's cameras carry a
 * `/api/camera_proxy/camera.<entity>` thumbnail, which names one of the camera's entities.
 */
export function findProtectCamera(nvr: BrowseItem, cameraId: string): string | undefined {
	return nvr.children?.find((child) => {
		const entity = /camera_proxy\/(camera\.[a-z0-9_]+)/.exec(child.thumbnail ?? '')?.[1];
		return entity !== undefined && cameraPrefix(entity) === cameraId;
	})?.media_content_id;
}

/** The event types a camera offers (its browse children end in `:all`, `:ring`, ...). */
export function clipFilters(camera: BrowseItem): ClipFilter[] {
	const ids = new Set((camera.children ?? []).map((child) => child.media_content_id.split(':').pop()));
	return CLIP_FILTERS.map((f) => f.id).filter((id) => ids.has(id));
}

/** The browse id of a camera's clips of one event type over the last `days`. */
export const clipListId = (cameraBrowseId: string, filter: ClipFilter, days: ClipRange) =>
	`${cameraBrowseId}:${filter}:recent:${days}`;

/** A clip's thumbnail path to sign (Protect returns a 360px square whatever size is asked for). */
export const clipThumbnailPath = (thumbnail: string) => thumbnail.split('?')[0];

/** "Today", "Yesterday", else "Sat, Oct 17". */
export function formatClipDay(date: Date, now = new Date()): string {
	const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
	if (dayKey(date) === dayKey(now)) return 'Today';
	if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
	return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Clips (newest first) grouped by day, in order. */
export function groupClipsByDay(clips: Clip[], now = new Date()): { day: string; clips: Clip[] }[] {
	const groups: { key: string; day: string; clips: Clip[] }[] = [];
	for (const clip of clips) {
		const key = dayKey(clip.start);
		const last = groups[groups.length - 1];
		if (last?.key === key) last.clips.push(clip);
		else groups.push({ key, day: formatClipDay(clip.start, now), clips: [clip] });
	}
	return groups.map(({ day, clips }) => ({ day, clips }));
}

/** "4:16 PM". */
export const formatClipTime = (date: Date) =>
	date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "37s", "1m 56s", "1h 2m". */
export function formatClipDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}h ${m}m`;
	return s ? `${m}m ${s}s` : `${m}m`;
}

/** Where the scrubber's frames are taken: the middle of each of `count` equal slices of the clip. */
export function frameTimes(duration: number, count: number): number[] {
	if (!(duration > 0) || count < 1) return [];
	return Array.from({ length: count }, (_, i) => ((i + 0.5) * duration) / count);
}

/** A clip's position: "0:07", "1:05", "1:02:09". */
export const formatClipPosition = (seconds: number) => formatClock(seconds);

/** The time of day at a position in the clip: "9:24:15 PM". */
export const formatClipClock = (start: Date, offsetSeconds: number) =>
	new Date(start.getTime() + Math.max(0, offsetSeconds) * 1000).toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
	});

/** A downloaded clip's name: "front-porch-doorbell-2026-10-23-2124-person.mp4". */
export function clipFileName(camera: string, clip: Pick<Clip, 'start' | 'label'>): string {
	const slug = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	const d = clip.start;
	const when = `${dayKey(d)}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
	return `${[slug(camera), when, slug(clip.label)].filter(Boolean).join('-')}.mp4`;
}

/** Playback speeds the player cycles through (security footage is often watched fast). */
export const CLIP_SPEEDS = [1, 2, 4] as const;
/** The speed after `speed` in `CLIP_SPEEDS`, back to 1× after the fastest (and from an unknown one). */
export const nextClipSpeed = (speed: number) => CLIP_SPEEDS[(CLIP_SPEEDS.indexOf(speed as 1) + 1) % CLIP_SPEEDS.length];

/**
 * Whether bytes are a whole MP4: its top-level boxes run back to back to exactly the last byte, and
 * hold the video (`mdat`) and its index (`moov`). Protect's clips put the index last, so a download
 * that's missing anything at all is missing it.
 */
export function isCompleteMp4(bytes: Uint8Array): boolean {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const seen = new Set<string>();
	let offset = 0;
	while (offset + 8 <= bytes.length) {
		let size = view.getUint32(offset);
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		if (size === 1) {
			if (offset + 16 > bytes.length) return false;
			size = Number(view.getBigUint64(offset + 8));
		} else if (size === 0) size = bytes.length - offset; // to the end of the file
		if (size < 8) return false;
		seen.add(type);
		offset += size;
	}
	return offset === bytes.length && seen.has('moov') && seen.has('mdat');
}

/**
 * Download a clip whole, as a blob. Since UniFi OS 6.0.17 the console declares every clip 4KB longer
 * than it is, and Home Assistant breaks off the response at the end; what arrived by then is the
 * whole clip, so it's kept when it's a complete MP4 (`isCompleteMp4`). On the LAN it always is;
 * through the remote-access tunnel the break-off sometimes loses the end, so a short one is fetched
 * again, up to `attempts` times. `onProgress` gets 0–1. Rejects when every attempt fails.
 */
export async function downloadClip(
	url: string,
	signal: AbortSignal,
	onProgress?: (fraction: number) => void,
	attempts = 3,
): Promise<Blob> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await downloadOnce(url, signal, onProgress);
		} catch (err) {
			if (signal.aborted || attempt >= attempts) throw err;
		}
	}
}

async function downloadOnce(url: string, signal: AbortSignal, onProgress?: (fraction: number) => void): Promise<Blob> {
	const res = await fetch(url, { signal });
	if (!res.ok || !res.body) throw new Error(res.statusText || 'No clip');
	const expected = Number(res.headers.get('content-length')) || 0;
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	let broken: unknown;
	for (;;) {
		const next = await reader.read().catch((err: unknown) => {
			broken = err;
			return undefined;
		});
		if (!next || next.done) break;
		chunks.push(next.value);
		received += next.value.length;
		if (expected) onProgress?.(Math.min(1, received / expected));
	}
	if (signal.aborted) throw signal.reason ?? new Error('Aborted');
	const bytes = new Uint8Array(received);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.length;
	}
	if (broken !== undefined && !isCompleteMp4(bytes)) throw broken;
	return new Blob([bytes], { type: 'video/mp4' });
}
