/**
 * Stills across a clip, for the clip player's scrubber.
 *
 * @module
 */

import { useEffect, useState } from 'preact/compat';
import { frameTimes } from '../../lib/clips';

// Frames for the scrubber: enough to recognize what happens when, cheap enough for the wall panels
const FRAME_COUNT = 10;
const FRAME_WIDTH = 192;
// A seek that never lands (iOS decodes nothing for a video that isn't playing) gives up on the rest
const SEEK_TIMEOUT_MS = 4000;

/**
 * Stills across a clip for its scrubber, taken from a second, hidden copy of the video (seeked to
 * the middle of each slice and drawn to a canvas, same-origin), so the one playing isn't disturbed.
 * They arrive one by one (`(string | undefined)[]`, a slot each); none on a device that can't seek
 * a video it isn't playing, where the scrubber is a plain bar.
 */
export function useClipFrames(url: string | undefined, enabled: boolean): (string | undefined)[] {
	const [frames, setFrames] = useState<(string | undefined)[]>([]);

	useEffect(() => {
		setFrames([]);
		if (!url || !enabled) return;
		let active = true;
		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.preload = 'auto';
		video.src = url;
		const canvas = document.createElement('canvas');

		const seek = (time: number) =>
			new Promise<boolean>((resolve) => {
				const timer = setTimeout(() => done(false), SEEK_TIMEOUT_MS);
				const done = (ok: boolean) => {
					clearTimeout(timer);
					video.removeEventListener('seeked', onSeeked);
					resolve(ok);
				};
				const onSeeked = () => done(true);
				video.addEventListener('seeked', onSeeked);
				video.currentTime = time;
			});

		const capture = async () => {
			const times = frameTimes(video.duration, FRAME_COUNT);
			canvas.width = FRAME_WIDTH;
			canvas.height = Math.round((FRAME_WIDTH * video.videoHeight) / Math.max(1, video.videoWidth)) || 108;
			const context = canvas.getContext('2d');
			if (!context) return;
			for (const [i, time] of times.entries()) {
				if (!active || !(await seek(time)) || !active) return;
				context.drawImage(video, 0, 0, canvas.width, canvas.height);
				const frame = canvas.toDataURL('image/jpeg', 0.6);
				setFrames((prev) => {
					const next = prev.length ? [...prev] : Array.from<string | undefined>({ length: times.length });
					next[i] = frame;
					return next;
				});
			}
		};
		video.addEventListener('loadeddata', () => void capture().catch(() => {}), { once: true });
		return () => {
			active = false;
			video.removeAttribute('src');
			video.load();
		};
	}, [url, enabled]);

	return frames;
}
