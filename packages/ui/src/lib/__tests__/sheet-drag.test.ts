import { describe, expect, it } from 'bun:test';
import {
	SHEET_CLOSE_SHARE,
	SHEET_IDLE,
	SHEET_SLOP_PX,
	type SheetDragAction,
	type SheetDragState,
	sheetCloses,
	sheetDragReducer,
	sheetHoldsTouch,
	sheetOffset,
} from '../sheet-drag';

// A 400px sheet, touched at (100, 100) at t=0
const HEIGHT = 400;
const run = (...actions: SheetDragAction[]): SheetDragState =>
	actions.reduce(
		sheetDragReducer,
		sheetDragReducer(SHEET_IDLE, { type: 'down', x: 100, y: 100, t: 0, height: HEIGHT }),
	);
const move = (x: number, y: number, t: number): SheetDragAction => ({ type: 'move', x, y, t });

describe('dragging a sheet down', () => {
	it('waits out the slop, then follows the finger from there', () => {
		expect(run(move(102, 100 + SHEET_SLOP_PX, 10)).phase).toBe('pending');
		const dragging = run(move(100, 112, 10));
		expect(dragging.phase).toBe('dragging');
		expect(dragging.dy).toBe(0);
		expect(run(move(100, 112, 10), move(100, 162, 50)).dy).toBe(50);
	});

	it('leaves a touch going up or sideways to the content', () => {
		// Up: the content scrolls
		expect(run(move(100, 80, 10)).phase).toBe('idle');
		// Sideways: a slider, a chip row, a swiped row
		expect(run(move(130, 105, 10)).phase).toBe('idle');
		// Mostly sideways though a little down
		expect(run(move(120, 110, 10)).phase).toBe('idle');
	});

	it('pulls against the finger above where it started, less the further it goes', () => {
		expect(sheetOffset(40)).toBe(40);
		expect(sheetOffset(-10)).toBeLessThan(0);
		expect(sheetOffset(-10)).toBeGreaterThan(-10);
		expect(sheetOffset(-200)).toBeGreaterThan(-40);
		const up = run(move(100, 112, 10), move(100, 50, 50));
		expect(up.dy).toBeCloseTo(sheetOffset(-62));
	});
});

describe('letting a sheet go', () => {
	it(`closes past ${SHEET_CLOSE_SHARE * 100}% of its height`, () => {
		const far = HEIGHT * SHEET_CLOSE_SHARE + 1;
		// Slowly (a pause before letting go), so it's the distance that counts
		expect(run(move(100, 112, 10), move(100, 112 + far, 1000), { type: 'up', t: 1300 }).phase).toBe('closing');
	});

	it('springs back short of it', () => {
		const state = run(move(100, 112, 10), move(100, 172, 1000), { type: 'up', t: 1300 });
		expect(state.phase).toBe('settling');
		expect(sheetDragReducer(state, { type: 'reset' })).toEqual(SHEET_IDLE);
	});

	it('closes on a quick flick down from a short distance', () => {
		// 40px in 40ms: 1px/ms
		const flick = run(move(100, 112, 10), move(100, 132, 30), move(100, 152, 50), { type: 'up', t: 60 });
		expect(flick.phase).toBe('closing');
	});

	it("doesn't close on a twitch, a pause before letting go, or a flick back up", () => {
		expect(run(move(100, 112, 10), move(100, 122, 15), { type: 'up', t: 20 }).phase).toBe('settling');
		expect(run(move(100, 112, 10), move(100, 152, 50), { type: 'up', t: 400 }).phase).toBe('settling');
		// Down 80px, then flicked back up toward 60px
		const back = run(move(100, 112, 10), move(100, 192, 500), move(100, 172, 520), { type: 'up', t: 530 });
		expect(back.phase).toBe('settling');
	});

	it('is a tap when it never moved past the slop', () => {
		expect(run({ type: 'up', t: 50 })).toEqual(SHEET_IDLE);
	});

	it('springs back when the browser takes the touch mid-drag', () => {
		expect(run(move(100, 112, 10), move(100, 150, 50), { type: 'cancel' }).phase).toBe('settling');
		expect(run({ type: 'cancel' })).toEqual(SHEET_IDLE);
	});

	it('keeps closing once it is', () => {
		const closing = run(move(100, 112, 10), move(100, 300, 500), { type: 'up', t: 900 });
		expect(closing.phase).toBe('closing');
		expect(sheetDragReducer(closing, { type: 'down', x: 0, y: 0, t: 1000, height: HEIGHT })).toBe(closing);
		expect(sheetDragReducer(closing, { type: 'cancel' })).toBe(closing);
	});

	it('closes only when moved down', () => {
		expect(sheetCloses({ ...SHEET_IDLE, phase: 'dragging', height: HEIGHT, dy: -5, velocity: 2 })).toBe(false);
	});
});

describe('holding the touch from the page', () => {
	it('holds a drag, and a pending one heading down', () => {
		const pending = run();
		expect(sheetHoldsTouch(pending, 100, 104)).toBe(true);
		expect(sheetHoldsTouch(run(move(100, 112, 10)), 0, 0)).toBe(true);
	});

	it('lets a touch going up or sideways scroll', () => {
		const pending = run();
		expect(sheetHoldsTouch(pending, 100, 96)).toBe(false);
		expect(sheetHoldsTouch(pending, 106, 103)).toBe(false);
		expect(sheetHoldsTouch(SHEET_IDLE, 100, 200)).toBe(false);
	});
});

describe('closing a sheet without a drag', () => {
	it('slides away from rest', () => {
		expect(sheetDragReducer(SHEET_IDLE, { type: 'close' }).phase).toBe('closing');
	});

	it('slides away from a drag under way, and pointer events no longer move it', () => {
		const closing = run(move(100, 112, 10), move(100, 140, 50), { type: 'close' });
		expect(closing.phase).toBe('closing');
		expect(sheetDragReducer(closing, move(100, 200, 80))).toBe(closing);
		expect(sheetDragReducer(closing, { type: 'up', t: 100 })).toBe(closing);
		expect(sheetDragReducer(closing, { type: 'down', x: 0, y: 0, t: 120, height: HEIGHT })).toBe(closing);
	});

	it('asked twice, is the same close', () => {
		const closing = sheetDragReducer(SHEET_IDLE, { type: 'close' });
		expect(sheetDragReducer(closing, { type: 'close' })).toBe(closing);
	});
});
