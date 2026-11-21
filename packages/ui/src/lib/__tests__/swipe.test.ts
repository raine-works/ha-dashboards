import { describe, expect, it } from 'bun:test';
import { SWIPE_IDLE, type SwipeAction, type SwipeSides, type SwipeState, swipeOffset, swipeReducer } from '../swipe';

const BOTH: SwipeSides = { start: true, end: true };

const run = (actions: SwipeAction[], sides = BOTH) =>
	actions.reduce<SwipeState>((state, action) => swipeReducer(state, action, sides), SWIPE_IDLE);

const down = (x = 100, y = 100, t = 0): SwipeAction => ({ type: 'down', x, y, t, width: 400 });
const move = (x: number, y = 100, t = 0): SwipeAction => ({ type: 'move', x, y, t });

describe('swipeReducer', () => {
	it('waits for the slop before dragging, from where the finger is then', () => {
		expect(run([down(), move(105)]).phase).toBe('pending');
		const dragging = run([down(), move(112, 100, 10), move(132, 100, 400)]);
		expect(dragging.phase).toBe('dragging');
		expect(dragging.dx).toBe(20);
	});

	it('leaves a vertical move to the page', () => {
		expect(run([down(), move(103, 120)]).phase).toBe('idle');
		expect(run([down(), move(103, 120), move(300)]).phase).toBe('idle');
	});

	it('acts past 40% of the width, on the side it went', () => {
		const right = run([down(), move(112, 100, 10), move(290, 100, 500), { type: 'up', t: 900 }]);
		expect(right.phase).toBe('committed');
		expect(right.armed).toBe('start');
		const left = run([down(), move(88, 100, 10), move(-90, 100, 500), { type: 'up', t: 900 }]);
		expect(left.armed).toBe('end');
	});

	it('springs back short of it, marking the click that follows as a drag', () => {
		const back = run([down(), move(112, 100, 10), move(200, 100, 500), { type: 'up', t: 900 }]);
		expect(back.phase).toBe('settling');
		expect(back.dx).toBe(0);
		expect(back.settleFrom).toBe('start');
		expect(back.swallowClick).toBe(true);
		expect(swipeReducer(back, { type: 'reset' }, BOTH)).toEqual(SWIPE_IDLE);
		// Caught on the way back: a new gesture
		expect(swipeReducer(back, down(), BOTH).phase).toBe('pending');
		// A drag the page took over springs back too
		const taken = run([down(), move(88, 100, 10), move(40, 100, 300), { type: 'cancel' }]);
		expect(taken.phase).toBe('settling');
		expect(taken.settleFrom).toBe('end');
		expect(run([down(), { type: 'up', t: 5 }]).swallowClick).toBe(false);
	});

	it('acts on a quick flick, but not one paused before letting go', () => {
		const flick = [down(), move(112, 100, 0), move(140, 100, 20), move(180, 100, 40)];
		expect(run([...flick, { type: 'up', t: 50 }]).phase).toBe('committed');
		expect(run([...flick, { type: 'up', t: 400 }]).phase).toBe('settling');
	});

	it('resists, and never acts, toward a side with no action', () => {
		const sides = { start: true, end: false };
		const state = run([down(), move(88, 100, 10), move(-500, 100, 500)], sides);
		expect(state.dx).toBe(-80);
		expect(state.armed).toBeNull();
		expect(swipeReducer(state, { type: 'up', t: 510 }, sides).phase).toBe('settling');
	});

	it('takes a long press only while still, swallowing the click it ends with', () => {
		const held = run([down(), move(104, 102, 100), { type: 'longpress' }]);
		expect(held.phase).toBe('idle');
		expect(held.swallowClick).toBe(true);
		expect(swipeReducer(held, { type: 'up', t: 700 }, BOTH).swallowClick).toBe(true);
		expect(swipeReducer(held, down(), BOTH).swallowClick).toBe(false);
		const swiping = run([down(), move(130, 100, 100), { type: 'longpress' }]);
		expect(swiping.phase).toBe('dragging');
	});

	it('stays committed through a cancel until reset', () => {
		const committed = run([down(), move(112, 100, 10), move(290, 100, 500), { type: 'up', t: 900 }]);
		expect(swipeReducer(committed, { type: 'cancel' }, BOTH).phase).toBe('committed');
		expect(swipeReducer(committed, down(), BOTH).phase).toBe('committed');
		expect(swipeReducer(committed, { type: 'reset' }, BOTH)).toEqual(SWIPE_IDLE);
	});
});

describe('swipeOffset', () => {
	it('follows the finger up to the width', () => {
		expect(swipeOffset(120, 400, BOTH)).toBe(120);
		expect(swipeOffset(-900, 400, BOTH)).toBe(-400);
	});
});
