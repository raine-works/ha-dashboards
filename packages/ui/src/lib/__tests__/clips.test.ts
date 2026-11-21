import { describe, expect, it } from 'bun:test';
import {
	type BrowseItem,
	clipFileName,
	clipFilters,
	clipListId,
	clipThumbnailPath,
	downloadClip,
	findProtectCamera,
	formatClipClock,
	formatClipDay,
	formatClipDuration,
	formatClipPosition,
	frameTimes,
	groupClipsByDay,
	isCompleteMp4,
	nextClipSpeed,
	toClip,
	toClips,
} from '../clips';

const NVR = 'media-source://unifiprotect/5c15205702a1b003870003ea';
const event = (title: string, id = 'e1'): BrowseItem => ({
	title,
	media_content_id: `${NVR}:event:${id}`,
	can_play: true,
	thumbnail: `/api/unifiprotect/thumbnail/5c15205702a1b003870003ea/${id}?width=185&height=185`,
});

describe('toClip', () => {
	it('reads the time, length and what was detected from the title', () => {
		const clip = toClip(event('10/18/26 21:24:12 37s Object Detection - Person'));
		expect(clip?.start).toEqual(new Date(2026, 9, 18, 21, 24, 12));
		expect(clip?.duration).toBe(37);
		expect(clip?.kind).toBe('person');
		expect(clip?.label).toBe('Person');
	});

	it('knows rings, packages, motion and speech', () => {
		expect(toClip(event('10/18/26 21:24:14 10s Ring Event'))).toMatchObject({ kind: 'ring', label: 'Ring' });
		expect(toClip(event('10/18/26 11:27:13 6s Object Detection - Package'))).toMatchObject({
			kind: 'package',
			label: 'Package',
		});
		expect(toClip(event('10/18/26 09:00:00 12s Motion Event'))).toMatchObject({ kind: 'motion', label: 'Motion' });
		expect(toClip(event('10/18/26 16:16:13 18s Audio Detection - Speak'))).toMatchObject({
			kind: 'audio',
			label: 'Speech',
		});
	});

	it('names several objects by the first', () => {
		expect(toClip(event('10/18/26 08:00:00 9s Object Detection - Vehicle, Person'))).toMatchObject({
			kind: 'vehicle',
			label: 'Vehicle',
		});
	});

	it('adds up minutes and hours', () => {
		expect(toClip(event('10/18/26 16:07:47 1m 56s Object Detection - Person'))?.duration).toBe(116);
		expect(toClip(event('10/18/26 16:07:47 1h 2m 3s Motion Event'))?.duration).toBe(3723);
	});

	it('skips folders and titles it cannot read', () => {
		expect(toClip({ title: 'Last 24 Hours', media_content_id: `${NVR}:browse:x:all:recent:1` })).toBeUndefined();
		expect(toClip(event('Something else'))).toBeUndefined();
	});
});

describe('toClips', () => {
	it('lists playable events newest first', () => {
		const clips = toClips({
			title: 'Last 24 Hours',
			media_content_id: `${NVR}:browse:cam:all:recent:1`,
			children: [
				event('10/18/26 11:27:13 6s Object Detection - Package', 'a'),
				event('10/18/26 21:24:14 10s Ring Event', 'b'),
				{ title: 'October 2026', media_content_id: `${NVR}:browse:cam:all:range:2026:10` },
			],
		});
		expect(clips.map((c) => c.label)).toEqual(['Ring', 'Package']);
	});
});

describe('Protect browsing', () => {
	const nvr: BrowseItem = {
		title: 'Nexus',
		media_content_id: `${NVR}:browse`,
		children: [
			{ title: 'All Cameras', media_content_id: `${NVR}:browse:all` },
			{
				title: 'Doorbell',
				media_content_id: `${NVR}:browse:6a82`,
				thumbnail: '/api/camera_proxy/camera.front_porch_doorbell_high_resolution_channel?width=185&height=185',
			},
		],
	};

	it('finds a camera by any of its entities', () => {
		expect(findProtectCamera(nvr, 'front_porch_doorbell')).toBe(`${NVR}:browse:6a82`);
		expect(findProtectCamera(nvr, 'garage')).toBeUndefined();
	});

	it('offers the event types the camera has, in order', () => {
		const camera: BrowseItem = {
			title: 'Doorbell',
			media_content_id: `${NVR}:browse:6a82`,
			children: ['all', 'ring', 'motion', 'smart', 'audio'].map((type) => ({
				title: type,
				media_content_id: `${NVR}:browse:6a82:${type}`,
			})),
		};
		expect(clipFilters(camera)).toEqual(['all', 'ring', 'smart', 'motion', 'audio']);
		expect(clipListId(`${NVR}:browse:6a82`, 'ring', 7)).toBe(`${NVR}:browse:6a82:ring:recent:7`);
	});

	it('signs thumbnails without the size query (Protect ignores it)', () => {
		expect(clipThumbnailPath('/api/unifiprotect/thumbnail/n/e?width=185&height=185')).toBe(
			'/api/unifiprotect/thumbnail/n/e',
		);
	});
});

describe('days and lengths', () => {
	const now = new Date(2026, 9, 19, 3, 0);

	it('names today, yesterday, then the date', () => {
		expect(formatClipDay(new Date(2026, 9, 19, 1, 0), now)).toBe('Today');
		expect(formatClipDay(new Date(2026, 9, 18, 23, 0), now)).toBe('Yesterday');
		expect(formatClipDay(new Date(2026, 9, 16, 12, 0), now)).toContain('16');
	});

	it('groups clips by day in order', () => {
		const clips = toClips({
			title: 'x',
			media_content_id: 'x',
			children: [
				event('10/19/26 01:00:00 5s Motion Event', 'a'),
				event('10/18/26 21:00:00 5s Motion Event', 'b'),
				event('10/18/26 20:00:00 5s Motion Event', 'c'),
			],
		});
		expect(groupClipsByDay(clips, now).map((g) => [g.day, g.clips.length])).toEqual([
			['Today', 1],
			['Yesterday', 2],
		]);
	});

	it('formats lengths', () => {
		expect(formatClipDuration(37)).toBe('37s');
		expect(formatClipDuration(116)).toBe('1m 56s');
		expect(formatClipDuration(120)).toBe('2m');
		expect(formatClipDuration(3723)).toBe('1h 2m');
	});
});

describe('clip player', () => {
	it('takes a frame from the middle of each slice', () => {
		expect(frameTimes(40, 4)).toEqual([5, 15, 25, 35]);
		expect(frameTimes(Number.NaN, 4)).toEqual([]);
		expect(frameTimes(10, 0)).toEqual([]);
	});

	it('formats positions', () => {
		expect(formatClipPosition(7.9)).toBe('0:07');
		expect(formatClipPosition(65)).toBe('1:05');
		expect(formatClipPosition(3729)).toBe('1:02:09');
		expect(formatClipPosition(Number.NaN)).toBe('0:00');
	});

	it('gives the time of day at a position', () => {
		const start = new Date(2026, 9, 23, 21, 24, 0);
		expect(formatClipClock(start, 15)).toBe(
			new Date(2026, 9, 23, 21, 24, 15).toLocaleTimeString(undefined, {
				hour: 'numeric',
				minute: '2-digit',
				second: '2-digit',
			}),
		);
	});

	it('names a saved clip after the camera, the time and what happened', () => {
		expect(clipFileName('Front Porch Doorbell', { start: new Date(2026, 9, 23, 21, 4), label: 'Person' })).toBe(
			'front-porch-doorbell-2026-10-23-2104-person.mp4',
		);
	});

	it('cycles the speeds', () => {
		expect([nextClipSpeed(1), nextClipSpeed(2), nextClipSpeed(4)]).toEqual([2, 4, 1]);
	});
});

/** An MP4's top-level boxes, each `size` bytes (header included). */
function mp4(...boxes: [string, number][]): Uint8Array {
	const bytes = new Uint8Array(boxes.reduce((sum, [, size]) => sum + size, 0));
	const view = new DataView(bytes.buffer);
	let at = 0;
	for (const [type, size] of boxes) {
		view.setUint32(at, size);
		bytes.set(
			[...type].map((c) => c.charCodeAt(0)),
			at + 4,
		);
		at += size;
	}
	return bytes;
}

describe('isCompleteMp4', () => {
	const whole = mp4(['ftyp', 32], ['mdat', 5000], ['moov', 700]);

	it('accepts boxes that end exactly at the last byte, with the video and its index', () => {
		expect(isCompleteMp4(whole)).toBe(true);
	});

	it('rejects a cut-off file, a missing index and junk', () => {
		expect(isCompleteMp4(whole.subarray(0, whole.length - 100))).toBe(false);
		expect(isCompleteMp4(mp4(['ftyp', 32], ['mdat', 5000]))).toBe(false);
		expect(isCompleteMp4(new Uint8Array([0, 0, 0, 2, 1, 2, 3, 4]))).toBe(false);
		expect(isCompleteMp4(new Uint8Array())).toBe(false);
	});
});

describe('downloadClip', () => {
	const whole = mp4(['ftyp', 32], ['mdat', 5000], ['moov', 700]);
	const realFetch = globalThis.fetch;
	/** A response whose body sends `bytes` in two chunks, then errors when `breaks` (as UniFi OS 6.0.17's do). */
	const serve = (bytes: Uint8Array, breaks: boolean, length = bytes.length + 4096) => {
		globalThis.fetch = (async () => {
			// Read one at a time, as a network delivers them: the error comes after the bytes
			const parts = [bytes.subarray(0, 1000), bytes.subarray(1000)];
			return new Response(
				new ReadableStream<Uint8Array>({
					pull(controller) {
						const part = parts.shift();
						if (part) controller.enqueue(part);
						else if (breaks) controller.error(new Error('stream reset'));
						else controller.close();
					},
				}),
				{ headers: { 'content-length': String(length) } },
			);
		}) as unknown as typeof fetch;
	};
	const restore = () => {
		globalThis.fetch = realFetch;
	};

	it('keeps a whole clip whose response broke off at the end', async () => {
		serve(whole, true);
		const progress: number[] = [];
		const blob = await downloadClip('/clip', new AbortController().signal, (f) => progress.push(f)).finally(restore);
		expect(blob.size).toBe(whole.length);
		expect(blob.type).toBe('video/mp4');
		expect(progress.at(-1)).toBeLessThan(1);
	});

	it('rejects one that broke off partway on every attempt', async () => {
		serve(whole.subarray(0, 3000), true);
		await expect(downloadClip('/clip', new AbortController().signal).finally(restore)).rejects.toThrow('stream reset');
	});

	it('fetches again when the end was lost, up to three times', async () => {
		let calls = 0;
		const responses = [whole.subarray(0, 3000), whole.subarray(0, 4000), whole];
		globalThis.fetch = (async () => {
			const bytes = responses[calls++];
			let sent = false;
			return new Response(
				new ReadableStream<Uint8Array>({
					pull(controller) {
						if (!sent) {
							sent = true;
							controller.enqueue(bytes);
						} else controller.error(new Error('stream reset'));
					},
				}),
			);
		}) as unknown as typeof fetch;
		const blob = await downloadClip('/clip', new AbortController().signal).finally(restore);
		expect(blob.size).toBe(whole.length);
		expect(calls).toBe(3);
	});

	it('returns a download that finished normally', async () => {
		serve(whole, false, whole.length);
		const blob = await downloadClip('/clip', new AbortController().signal).finally(restore);
		expect(blob.size).toBe(whole.length);
	});
});
