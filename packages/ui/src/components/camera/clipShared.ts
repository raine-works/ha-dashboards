/**
 * What the clip list and the clip player share: each kind's icon and the signed thumbnails.
 *
 * @module
 */

import {
	Activity,
	AudioLines,
	Bell,
	Car,
	type LucideIcon,
	Package,
	PawPrint,
	ScanFace,
	User,
	Video,
} from 'lucide-react';
import { type Clip, type ClipKind, clipThumbnailPath } from '../../lib/clips';
import { signPath } from './useCameraClips';

/** Each kind of clip's icon (a ring, a person, a vehicle…). */
export const CLIP_ICONS: Record<ClipKind, LucideIcon> = {
	ring: Bell,
	person: User,
	vehicle: Car,
	animal: PawPrint,
	package: Package,
	face: ScanFace,
	motion: Activity,
	audio: AudioLines,
	other: Video,
};

// How long a signed thumbnail path is good for, and how long it's reused: signed again well before
// it expires, since the page (a wall panel's) stays open for hours and Home Assistant refuses an
// expired signature
const SIGNED_FOR_S = 3600;
const REUSE_MS = (SIGNED_FOR_S - 10 * 60) * 1000;

// Signed thumbnail paths, so switching filters or cameras doesn't sign the same image again
const signedThumbnails = new Map<string, { at: number; signed: Promise<string> }>();

/** A clip's thumbnail URL, signed once (`/api/unifiprotect/thumbnail` needs auth) and shared until it nears expiry. */
export function signedThumbnail(
	hass: Parameters<typeof signPath>[0],
	clip: Clip,
	now = Date.now(),
): Promise<string> | undefined {
	if (!clip.thumbnail) return undefined;
	const path = clipThumbnailPath(clip.thumbnail);
	const cached = signedThumbnails.get(path);
	if (cached && now - cached.at < REUSE_MS) return cached.signed;
	const signed = signPath(hass, path, SIGNED_FOR_S);
	const entry = { at: now, signed };
	signed.catch(() => signedThumbnails.get(path) === entry && signedThumbnails.delete(path));
	signedThumbnails.set(path, entry);
	return signed;
}
