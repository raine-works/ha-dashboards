/**
 * One-handed zoom for a map, the way Google Maps does it: tap, then touch again and hold, and drag
 * down to zoom in or up to zoom out. The arithmetic; `PeopleMap` runs it on Leaflet.
 *
 * @module
 */

/** The second touch counts when it lands this soon (ms) after the first tap, and `DOUBLE_TAP_PX` close to it. */
export const DOUBLE_TAP_MS = 300;
/** How close (px) the second touch lands to the first tap to count. */
export const DOUBLE_TAP_PX = 40;
/** A touch that moves less than this is still a tap (and a held second touch hasn't started zooming). */
export const TAP_SLOP_PX = 8;
/** Dragging this far changes the zoom by one level (a thumb's easy travel covers about three). */
export const DRAG_PX_PER_ZOOM = 110;

/** Where and when a touch began or ended. */
export interface TapPoint {
	/** Client x, px. */
	x: number;
	/** Client y, px. */
	y: number;
	/** ms, any clock (both taps on the same one). */
	time: number;
}

/** A touch that began at `down` and ended at `up`: a tap (short and still), not a drag or a hold. */
export function isTap(down: TapPoint, up: TapPoint): boolean {
	return up.time - down.time < DOUBLE_TAP_MS && Math.hypot(up.x - down.x, up.y - down.y) < TAP_SLOP_PX;
}

/** Does a touch at `next` follow the tap that ended at `tap` closely enough to start a zoom drag? */
export function isSecondTap(tap: TapPoint | null, next: TapPoint): boolean {
	if (!tap) return false;
	const elapsed = next.time - tap.time;
	return elapsed >= 0 && elapsed < DOUBLE_TAP_MS && Math.hypot(next.x - tap.x, next.y - tap.y) < DOUBLE_TAP_PX;
}

/** The zoom after dragging `dy` px from where the hold began (down, positive, zooms in), within the map's range. */
export function dragZoom(startZoom: number, dy: number, minZoom: number, maxZoom: number): number {
	return Math.min(maxZoom, Math.max(minZoom, startZoom + dy / DRAG_PX_PER_ZOOM));
}
