/**
 * A bottom sheet dragged down to close it (a `sheet` or `detail` dialog on a phone, `DialogContent`),
 * as Vaul's drawer does: the gesture as a reducer, so it's tested apart from the DOM it moves.
 *
 * @module
 */

/** Movement before the gesture picks a direction: anything but down is the content's own (a scroll). */
export const SHEET_SLOP_PX = 8;
/** Dragged down past this share of the sheet's height, letting go closes it (Vaul's 25%). */
export const SHEET_CLOSE_SHARE = 0.25;
/** A downward flick this fast (px/ms) closes it from any distance past `SHEET_FLICK_MIN_PX` (Vaul's 0.4). */
export const SHEET_FLICK_SPEED = 0.4;
/** The least a flick must have moved it, so a fast twitch isn't a close. */
export const SHEET_FLICK_MIN_PX = 24;
/** How long the sheet takes to slide away or spring back, on the sheet's curve (`--animate-sheet-in`'s). */
export const SHEET_SETTLE_MS = 320;
/** The sheet's curve, iOS's: quick to start, long to settle. */
export const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Where a drag is. */
export interface SheetDragState {
	/**
	 * `pending`: down, not yet moved past the slop; `dragging`: following the finger; `closing`: let go
	 * past the close point, sliding away; `settling`: let go short of it, springing back (reset when home).
	 */
	phase: 'idle' | 'pending' | 'dragging' | 'closing' | 'settling';
	/** Where the drag started (px; moved to the slop's end once dragging, so the sheet doesn't jump). */
	startX: number;
	/** Where the drag started vertically (px). */
	startY: number;
	/** The sheet's offset now (px, after `sheetOffset`; down is positive). */
	dy: number;
	/** The sheet's height (px). */
	height: number;
	/** px/ms, down is positive (smoothed). */
	velocity: number;
	/** The last move's y (px). */
	lastY: number;
	/** The last move's time (ms). */
	lastT: number;
}

/** A sheet at rest. */
export const SHEET_IDLE: SheetDragState = {
	phase: 'idle',
	startX: 0,
	startY: 0,
	dy: 0,
	height: 0,
	velocity: 0,
	lastY: 0,
	lastT: 0,
};

/**
 * The pointer events (and the settle timer) the reducer takes; `t` is a timestamp in ms. `close` is a
 * close asked for without a drag (a tap outside, the X, Escape, Back): the sheet slides away as it
 * does when let go past the close point.
 */
export type SheetDragAction =
	| { type: 'down'; x: number; y: number; t: number; height: number }
	| { type: 'move'; x: number; y: number; t: number }
	| { type: 'up'; t: number }
	| { type: 'cancel' }
	| { type: 'close' }
	| { type: 'reset' };

/**
 * The offset shown for a finger `raw` px below where the drag started: down follows the finger, up
 * pulls against it, a little and less the further it goes (the sheet is as high as it goes).
 */
export function sheetOffset(raw: number): number {
	return raw >= 0 ? raw : -8 * Math.log1p(-raw / 8);
}

/** Whether letting go now closes the sheet: past `SHEET_CLOSE_SHARE` of its height, or flicked down. */
export function sheetCloses(state: SheetDragState): boolean {
	if (state.dy <= 0) return false;
	if (state.dy >= state.height * SHEET_CLOSE_SHARE) return true;
	return state.velocity >= SHEET_FLICK_SPEED && state.dy >= SHEET_FLICK_MIN_PX;
}

/**
 * Whether the sheet keeps a touch moving to (`x`, `y`) from the page: while it drags, and while a
 * pending drag is heading down (the content is at its top, so down has nothing to scroll). Anything
 * else (up, sideways) is left to scroll.
 */
export function sheetHoldsTouch(state: SheetDragState, x: number, y: number): boolean {
	if (state.phase === 'dragging') return true;
	if (state.phase !== 'pending') return false;
	const dx = x - state.startX;
	const dy = y - state.startY;
	return dy > 0 && dy >= Math.abs(dx);
}

/**
 * The gesture's next state: down past the slop starts a drag (up or sideways first gives the touch
 * back to the content), letting go past the close point or on a downward flick closes, anything short
 * springs back.
 */
export function sheetDragReducer(state: SheetDragState, action: SheetDragAction): SheetDragState {
	switch (action.type) {
		case 'down':
			// Once it's closing, it closes
			if (state.phase === 'closing') return state;
			return {
				...SHEET_IDLE,
				phase: 'pending',
				startX: action.x,
				startY: action.y,
				lastY: action.y,
				lastT: action.t,
				height: action.height,
			};
		case 'move': {
			if (state.phase === 'pending') {
				const dx = action.x - state.startX;
				const dy = action.y - state.startY;
				if (Math.abs(dx) <= SHEET_SLOP_PX && Math.abs(dy) <= SHEET_SLOP_PX) return state;
				// Up or sideways first: a scroll, a slider, a row swiped aside
				if (dy <= 0 || dy < Math.abs(dx)) return { ...SHEET_IDLE };
				// From where it is now, so the sheet doesn't jump the slop's height
				return { ...state, phase: 'dragging', startY: action.y, lastY: action.y, lastT: action.t };
			}
			if (state.phase !== 'dragging') return state;
			const elapsed = action.t - state.lastT;
			// Smoothed, so one late event doesn't read as a flick
			const velocity = elapsed > 0 ? state.velocity * 0.5 + ((action.y - state.lastY) / elapsed) * 0.5 : state.velocity;
			return { ...state, dy: sheetOffset(action.y - state.startY), velocity, lastY: action.y, lastT: action.t };
		}
		case 'up': {
			if (state.phase === 'pending') return { ...SHEET_IDLE };
			if (state.phase !== 'dragging') return state;
			// A pause before letting go isn't a flick
			const velocity = action.t - state.lastT > 100 ? 0 : state.velocity;
			const next = { ...state, velocity };
			if (sheetCloses(next)) return { ...next, phase: 'closing' };
			return next.dy === 0 ? { ...SHEET_IDLE } : { ...next, phase: 'settling' };
		}
		case 'cancel':
			// The browser took the touch (a scroll): a drag under way springs back
			if (state.phase === 'dragging') return state.dy === 0 ? { ...SHEET_IDLE } : { ...state, phase: 'settling' };
			return state.phase === 'pending' ? { ...SHEET_IDLE } : state;
		case 'close':
			// From wherever it is, a drag under way included: closing wins
			return state.phase === 'closing' ? state : { ...state, phase: 'closing' };
		case 'reset':
			return { ...SHEET_IDLE };
	}
}
