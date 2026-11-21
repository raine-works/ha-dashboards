// A row swiped sideways to act on it (SwipeRow): the gesture as a reducer, so the component keeps it
// in state with no refs (the React Compiler skips a component that writes one).

/** Which way: `start` = toward the right (the action revealed on the left), `end` = toward the left. */
export type SwipeSide = 'start' | 'end';

/** Movement before the gesture picks a direction: a vertical one is a scroll, left to the page. */
export const SWIPE_SLOP_PX = 8;
/** Past this share of the row's width, letting go acts. */
export const SWIPE_COMMIT_SHARE = 0.4;
/** A flick this fast (px/ms) acts from any distance past the minimum, in the way it's going. */
export const SWIPE_FLICK_SPEED = 0.6;
/** Held this long without moving: a long press (it starts selecting, in the To-do dialog). */
export const LONG_PRESS_MS = 500;
/** How long a row let go short of acting takes to spring back (its `ease-spring` overshoot included). */
export const SWIPE_SETTLE_MS = 450;
const FLICK_MIN_PX = 48;
// A side with no action pulls back against the finger
const RESIST = 0.2;

export interface SwipeState {
	/** `settling`: let go short of acting, springing back to rest (reset when it's there). */
	phase: 'idle' | 'pending' | 'dragging' | 'committed' | 'settling';
	startX: number;
	startY: number;
	dx: number;
	width: number;
	/** px/ms, positive to the right. */
	velocity: number;
	lastX: number;
	lastT: number;
	/** The side it's past the commit point of (or committed to). */
	armed: SwipeSide | null;
	/** Springing back: the side it's coming back from, whose action stays shown under it until it's home. */
	settleFrom: SwipeSide | null;
	/** A drag or long press just ended: the click that follows it isn't a tap. */
	swallowClick: boolean;
}

export const SWIPE_IDLE: SwipeState = {
	phase: 'idle',
	startX: 0,
	startY: 0,
	dx: 0,
	width: 0,
	velocity: 0,
	lastX: 0,
	lastT: 0,
	armed: null,
	settleFrom: null,
	swallowClick: false,
};

export type SwipeAction =
	| { type: 'down'; x: number; y: number; t: number; width: number }
	| { type: 'move'; x: number; y: number; t: number }
	| { type: 'up'; t: number }
	| { type: 'longpress' }
	| { type: 'cancel' }
	| { type: 'reset' };

/** Which sides have an action. */
export interface SwipeSides {
	start: boolean;
	end: boolean;
}

const sideOf = (dx: number): SwipeSide => (dx > 0 ? 'start' : 'end');

/** The offset shown for a finger `raw` px from where it started: free on a side with an action, resisted on one without. */
export function swipeOffset(raw: number, width: number, sides: SwipeSides): number {
	const allowed = raw > 0 ? sides.start : sides.end;
	const dx = allowed ? raw : raw * RESIST;
	const limit = allowed ? width : width * RESIST;
	return Math.max(-limit, Math.min(limit, dx));
}

const armedAt = (dx: number, width: number, sides: SwipeSides): SwipeSide | null => {
	if (dx === 0 || Math.abs(dx) < width * SWIPE_COMMIT_SHARE) return null;
	const side = sideOf(dx);
	return sides[side] ? side : null;
};

// Back to rest from `dx`: springing back from a side, or at rest already
const settle = (dx: number, swallowClick: boolean): SwipeState =>
	dx === 0
		? { ...SWIPE_IDLE, swallowClick }
		: { ...SWIPE_IDLE, phase: 'settling', settleFrom: sideOf(dx), swallowClick };

export function swipeReducer(state: SwipeState, action: SwipeAction, sides: SwipeSides): SwipeState {
	switch (action.type) {
		case 'down':
			if (state.phase === 'committed') return state;
			return {
				...SWIPE_IDLE,
				phase: 'pending',
				startX: action.x,
				startY: action.y,
				lastX: action.x,
				lastT: action.t,
				width: action.width,
			};
		case 'move': {
			if (state.phase === 'pending') {
				const dx = action.x - state.startX;
				const dy = action.y - state.startY;
				if (Math.abs(dy) > SWIPE_SLOP_PX && Math.abs(dy) >= Math.abs(dx)) return { ...SWIPE_IDLE };
				if (Math.abs(dx) <= SWIPE_SLOP_PX || Math.abs(dx) <= Math.abs(dy)) return state;
				// From where it is now, so the row doesn't jump the slop's width
				return { ...state, phase: 'dragging', startX: action.x, lastX: action.x, lastT: action.t };
			}
			if (state.phase !== 'dragging') return state;
			const dx = swipeOffset(action.x - state.startX, state.width, sides);
			const elapsed = action.t - state.lastT;
			// Smoothed, so one late event doesn't read as a flick
			const velocity = elapsed > 0 ? state.velocity * 0.5 + ((action.x - state.lastX) / elapsed) * 0.5 : state.velocity;
			return { ...state, dx, velocity, lastX: action.x, lastT: action.t, armed: armedAt(dx, state.width, sides) };
		}
		case 'up': {
			// A tap ends; after a long press, the click it makes is still to swallow
			if (state.phase !== 'dragging') return state.phase === 'pending' ? { ...SWIPE_IDLE } : state;
			// A pause before letting go isn't a flick
			const velocity = action.t - state.lastT > 100 ? 0 : state.velocity;
			const flick =
				Math.abs(velocity) >= SWIPE_FLICK_SPEED &&
				Math.abs(state.dx) >= FLICK_MIN_PX &&
				Math.sign(velocity) === Math.sign(state.dx) &&
				sides[sideOf(state.dx)];
			const side = state.armed ?? (flick ? sideOf(state.dx) : null);
			if (!side) return settle(state.dx, true);
			return { ...state, phase: 'committed', armed: side, swallowClick: true };
		}
		case 'longpress':
			return state.phase === 'pending' ? { ...SWIPE_IDLE, swallowClick: true } : state;
		case 'cancel':
			// Only a gesture under way: losing the pointer after letting go keeps what it decided
			if (state.phase === 'dragging') return settle(state.dx, false);
			return state.phase === 'pending' ? { ...SWIPE_IDLE } : state;
		case 'reset':
			return { ...SWIPE_IDLE };
	}
}
