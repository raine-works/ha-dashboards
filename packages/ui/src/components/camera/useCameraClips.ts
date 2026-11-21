import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady } from '../../context/HassContext';
import {
	type BrowseItem,
	type Clip,
	type ClipFilter,
	type ClipRange,
	clipFilters,
	clipListId,
	findProtectCamera,
	PROTECT_ROOT,
	toClips,
} from '../../lib/clips';
import type { HomeAssistant } from '../../types/homeassistant';

type Hass = Pick<HomeAssistant, 'callWS'>;

const browse = (hass: Hass, id: string) =>
	hass.callWS?.<BrowseItem>({ type: 'media_source/browse_media', media_content_id: id }) ??
	Promise.reject(new Error('No Home Assistant connection'));

// One lookup per page: the NVR's camera list and each camera's event types don't change
let nvrPromise: Promise<BrowseItem> | null = null;
const cameraCache = new Map<string, Promise<{ browseId: string; filters: ClipFilter[] } | null>>();

/** The camera's Protect browse id and the event types it records (null: not a Protect camera). */
function protectCamera(hass: Hass, cameraId: string) {
	let cached = cameraCache.get(cameraId);
	if (!cached) {
		nvrPromise ??= browse(hass, PROTECT_ROOT);
		cached = nvrPromise.then(async (nvr) => {
			const browseId = findProtectCamera(nvr, cameraId);
			if (!browseId) return null;
			return { browseId, filters: clipFilters(await browse(hass, browseId)) };
		});
		// Retry next time after a failure (offline, Protect restarting)
		cached.catch(() => {
			nvrPromise = null;
			cameraCache.delete(cameraId);
		});
		cameraCache.set(cameraId, cached);
	}
	return cached;
}

export type ClipsState =
	| { status: 'loading'; filters: ClipFilter[] }
	| { status: 'ready'; clips: Clip[]; filters: ClipFilter[] }
	| { status: 'unsupported' }
	| { status: 'error' };

/**
 * A camera's recorded events from UniFi Protect (Home Assistant's media source), newest first,
 * of one type over the last 1, 7 or 30 days. `reload` fetches the list again.
 */
export function useCameraClips(cameraId: string, filter: ClipFilter, days: ClipRange) {
	const { getHass } = useHassApi();
	const [state, setState] = useState<ClipsState>({ status: 'loading', filters: [] });
	const [version, setVersion] = useState(0);
	const ready = useHassReady();

	useEffect(() => {
		const hass = getHass();
		if (!ready || !hass) return;
		let active = true;
		setState((prev) => ({ status: 'loading', filters: 'filters' in prev ? prev.filters : [] }));
		protectCamera(hass, cameraId)
			.then(async (camera) => {
				if (!active) return;
				if (!camera) return setState({ status: 'unsupported' });
				const type = camera.filters.includes(filter) ? filter : 'all';
				const clips = toClips(await browse(hass, clipListId(camera.browseId, type, days)));
				if (active) setState({ status: 'ready', clips, filters: camera.filters });
			})
			.catch((err) => {
				console.error('Could not load camera clips', err);
				if (active) setState({ status: 'error' });
			});
		return () => {
			active = false;
		};
	}, [ready, cameraId, filter, days, version]);

	return { ...state, reload: () => setVersion((v) => v + 1) };
}

/** A signed URL for a clip's MP4 (valid for a day), from `media_source/resolve_media`. */
export async function resolveClip(hass: Hass, clip: Clip): Promise<string> {
	const resolved = await hass.callWS?.<{ url: string }>({
		type: 'media_source/resolve_media',
		media_content_id: clip.id,
	});
	if (!resolved?.url) throw new Error(`Could not resolve ${clip.id}`);
	return resolved.url;
}

/** A signed path for a Home Assistant API image (thumbnails need auth that an <img> can't send). */
export async function signPath(hass: Hass, path: string, expires = 3600): Promise<string> {
	const signed = await hass.callWS?.<{ path: string }>({ type: 'auth/sign_path', path, expires });
	if (!signed?.path) throw new Error(`Could not sign ${path}`);
	return signed.path;
}
