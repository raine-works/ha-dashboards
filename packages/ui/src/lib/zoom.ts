// Pinch-zoom for a camera view: a scale and a pan (the content's offset from centered, in px),
// applied as `translate(x, y) scale(s)` around the view's center. Pure, so the gestures are tested.

export interface Zoom {
	scale: number;
	x: number;
	y: number;
}

export const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 5;
/** What a double tap zooms to. */
export const TAP_ZOOM = 2.5;

/** A view size and a point in it, relative to its center. */
export interface Size {
	width: number;
	height: number;
}

/** Keep the scale in 1…MAX_ZOOM and the content covering the view (no empty edge shows). */
export function clampZoom({ scale, x, y }: Zoom, { width, height }: Size): Zoom {
	const s = Math.min(MAX_ZOOM, Math.max(1, scale));
	const maxX = ((s - 1) * width) / 2;
	const maxY = ((s - 1) * height) / 2;
	const clamp = (v: number, max: number) => Math.min(max, Math.max(-max, v));
	return s === 1 ? NO_ZOOM : { scale: s, x: clamp(x, maxX), y: clamp(y, maxY) };
}

/**
 * The zoom that keeps the content under `from` (relative to the view's center) under `to` at
 * `scale`: a pinch (fingers' midpoint at its start and now) or a zoom at a point (`from` = `to`).
 */
export function zoomBetween(
	start: Zoom,
	scale: number,
	from: { x: number; y: number },
	to: { x: number; y: number },
	view: Size,
): Zoom {
	// The content point under `from` at the start, in unscaled content coordinates
	const cx = (from.x - start.x) / start.scale;
	const cy = (from.y - start.y) / start.scale;
	return clampZoom({ scale, x: to.x - scale * cx, y: to.y - scale * cy }, view);
}

/** Zoom by `factor` keeping the content under `at` (relative to the center) in place. */
export function zoomAt(start: Zoom, factor: number, at: { x: number; y: number }, view: Size): Zoom {
	return zoomBetween(start, start.scale * factor, at, at, view);
}

/** Move the zoomed content by (dx, dy). */
export function panBy(start: Zoom, dx: number, dy: number, view: Size): Zoom {
	return clampZoom({ ...start, x: start.x + dx, y: start.y + dy }, view);
}

/** A double tap: in to TAP_ZOOM at the point, or back out when zoomed. */
export function toggleZoom(start: Zoom, at: { x: number; y: number }, view: Size): Zoom {
	return start.scale > 1 ? NO_ZOOM : zoomBetween(start, TAP_ZOOM, at, at, view);
}

/** "2.5×" */
export const formatZoom = (scale: number) => `${Math.round(scale * 10) / 10}×`;

// The gesture as a reducer over pointer events, so the hook needs no refs (the React Compiler
// doesn't know preact/compat's useRef, and skips a function that writes one) and it's testable.

type Point = { x: number; y: number };

/** Two taps this close in time (ms) and place (px) are a double tap. */
export const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** A finger that moves less than this is still a tap. */
const TAP_SLOP_PX = 8;

export interface PinchState {
	zoom: Zoom;
	/** Animate this change (a double tap, a reset), else follow the fingers exactly. */
	smooth: boolean;
	/** Fingers down, by pointer id, relative to the view's center. */
	pointers: Record<number, Point>;
	/** The gesture's start: the zoom then and where the fingers were. */
	gesture: { start: Zoom; points: Point[] } | null;
	/** The fingers moved since they went down (so lifting them isn't a tap). */
	moved: boolean;
	lastTap: { at: number; point: Point } | null;
}

export const INITIAL_PINCH: PinchState = {
	zoom: NO_ZOOM,
	smooth: false,
	pointers: {},
	gesture: null,
	moved: false,
	lastTap: null,
};

export type PinchAction =
	| { type: 'down'; id: number; point: Point }
	| { type: 'move'; id: number; point: Point; view: Size }
	| { type: 'up'; id: number; point: Point; view: Size; at: number }
	| { type: 'cancel'; id: number }
	| { type: 'wheel'; point: Point; view: Size; deltaY: number; pinch: boolean }
	| { type: 'reset' };

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The gesture restarted from the fingers down now (one lifting mid-pinch turns it into a pan). */
function restart(state: PinchState, pointers: Record<number, Point>): PinchState {
	const points = Object.values(pointers);
	return { ...state, pointers, gesture: points.length > 0 ? { start: state.zoom, points } : null };
}

export function pinchReducer(state: PinchState, action: PinchAction): PinchState {
	switch (action.type) {
		case 'down': {
			const first = Object.keys(state.pointers).length === 0;
			return restart(
				{ ...state, moved: first ? false : state.moved },
				{ ...state.pointers, [action.id]: action.point },
			);
		}
		case 'move': {
			if (!(action.id in state.pointers) || !state.gesture) return state;
			const pointers = { ...state.pointers, [action.id]: action.point };
			const { start, points } = state.gesture;
			const now = Object.values(pointers);
			if (now.length >= 2 && points.length >= 2) {
				const scale = (start.scale * distance(now[0], now[1])) / Math.max(1, distance(points[0], points[1]));
				const zoom = zoomBetween(start, scale, midpoint(points[0], points[1]), midpoint(now[0], now[1]), action.view);
				return { ...state, pointers, zoom, smooth: false, moved: true };
			}
			if (now.length === 1) {
				const dx = now[0].x - points[0].x;
				const dy = now[0].y - points[0].y;
				const moved = state.moved || Math.hypot(dx, dy) > TAP_SLOP_PX;
				const zoom = start.scale > 1 ? panBy(start, dx, dy, action.view) : state.zoom;
				return { ...state, pointers, zoom, smooth: false, moved };
			}
			return { ...state, pointers };
		}
		case 'up': {
			if (!(action.id in state.pointers)) return state;
			const { [action.id]: _, ...rest } = state.pointers;
			const next = restart(state, rest);
			if (Object.keys(rest).length > 0 || state.moved) return next;
			// A lone tap: a second one soon after, close by, toggles the zoom there
			const last = state.lastTap;
			if (last && action.at - last.at < DOUBLE_TAP_MS && distance(last.point, action.point) < DOUBLE_TAP_PX) {
				return { ...next, zoom: toggleZoom(state.zoom, action.point, action.view), smooth: true, lastTap: null };
			}
			return { ...next, lastTap: { at: action.at, point: action.point } };
		}
		case 'cancel': {
			if (!(action.id in state.pointers)) return state;
			const { [action.id]: _, ...rest } = state.pointers;
			return restart(state, rest);
		}
		case 'wheel': {
			// A trackpad pinch arrives as a ctrl+wheel with small deltas
			const factor = Math.exp(-action.deltaY * (action.pinch ? 0.01 : 0.002));
			return { ...state, zoom: zoomAt(state.zoom, factor, action.point, action.view), smooth: false };
		}
		case 'reset':
			return { ...state, zoom: NO_ZOOM, smooth: true, gesture: null };
	}
}
