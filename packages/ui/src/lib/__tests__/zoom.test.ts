import { describe, expect, it } from 'bun:test';
import {
	clampZoom,
	formatZoom,
	INITIAL_PINCH,
	MAX_ZOOM,
	NO_ZOOM,
	type PinchAction,
	panBy,
	pinchReducer,
	toggleZoom,
	zoomAt,
	zoomBetween,
} from '../zoom';

const view = { width: 400, height: 300 };

describe('clampZoom', () => {
	it('keeps the scale in range and the content covering the view', () => {
		expect(clampZoom({ scale: 0.5, x: 10, y: 10 }, view)).toEqual(NO_ZOOM);
		expect(clampZoom({ scale: 9, x: 0, y: 0 }, view).scale).toBe(MAX_ZOOM);
		// At 2× the content may move up to half the view's size each way
		expect(clampZoom({ scale: 2, x: 500, y: -500 }, view)).toEqual({ scale: 2, x: 200, y: -150 });
	});
});

describe('zoomAt', () => {
	it('keeps the point under the finger in place', () => {
		const at = { x: 100, y: 50 };
		const z = zoomAt(NO_ZOOM, 2, at, view);
		expect(z).toEqual({ scale: 2, x: -100, y: -50 });
		// The content point that was at `at` (100, 50) is drawn at x + s·100 = 100
		expect(z.x + z.scale * 100).toBe(100);
	});

	it('zooms around the center by default', () => {
		expect(zoomAt(NO_ZOOM, 3, { x: 0, y: 0 }, view)).toEqual({ scale: 3, x: 0, y: 0 });
	});
});

describe('zoomBetween', () => {
	it('follows the fingers: what was under their midpoint stays under it as they move', () => {
		const z = zoomBetween(NO_ZOOM, 2, { x: 0, y: 0 }, { x: 40, y: 20 }, view);
		expect(z).toEqual({ scale: 2, x: 40, y: 20 });
	});
});

describe('panBy', () => {
	it('moves zoomed content, never past its edge', () => {
		const z = { scale: 2, x: 0, y: 0 };
		expect(panBy(z, 50, -30, view)).toEqual({ scale: 2, x: 50, y: -30 });
		expect(panBy(z, 999, 0, view).x).toBe(200);
		expect(panBy(NO_ZOOM, 50, 50, view)).toEqual(NO_ZOOM);
	});
});

describe('toggleZoom', () => {
	it('zooms in at the tap, and back out', () => {
		const z = toggleZoom(NO_ZOOM, { x: 0, y: 0 }, view);
		expect(z.scale).toBe(2.5);
		expect(toggleZoom(z, { x: 10, y: 10 }, view)).toEqual(NO_ZOOM);
	});
});

describe('formatZoom', () => {
	it('rounds to a tenth', () => {
		expect(formatZoom(2.46)).toBe('2.5×');
		expect(formatZoom(3)).toBe('3×');
	});
});

describe('pinchReducer', () => {
	const run = (...actions: PinchAction[]) => actions.reduce(pinchReducer, INITIAL_PINCH);

	it('zooms as two fingers spread, keeping what was between them between them', () => {
		const state = run(
			{ type: 'down', id: 1, point: { x: -50, y: 0 } },
			{ type: 'down', id: 2, point: { x: 50, y: 0 } },
			{ type: 'move', id: 1, point: { x: -100, y: 0 }, view },
			{ type: 'move', id: 2, point: { x: 100, y: 0 }, view },
		);
		expect(state.zoom).toEqual({ scale: 2, x: 0, y: 0 });
		expect(state.moved).toBe(true);
	});

	it('pans with one finger once zoomed, and lifting a pinch finger turns it into a pan', () => {
		const zoomed = run(
			{ type: 'down', id: 1, point: { x: -50, y: 0 } },
			{ type: 'down', id: 2, point: { x: 50, y: 0 } },
			{ type: 'move', id: 2, point: { x: 150, y: 0 }, view },
			{ type: 'up', id: 1, point: { x: -50, y: 0 }, view, at: 100 },
		);
		const panned = pinchReducer(zoomed, { type: 'move', id: 2, point: { x: 170, y: 10 }, view });
		expect(panned.zoom.scale).toBe(zoomed.zoom.scale);
		expect(panned.zoom.x - zoomed.zoom.x).toBe(20);
		expect(panned.zoom.y - zoomed.zoom.y).toBe(10);
	});

	it('does not pan unzoomed (the page scrolls instead)', () => {
		const state = run(
			{ type: 'down', id: 1, point: { x: 0, y: 0 } },
			{ type: 'move', id: 1, point: { x: 40, y: 40 }, view },
		);
		expect(state.zoom).toEqual(NO_ZOOM);
	});

	it('double-taps in, and out', () => {
		const tap = (at: number): PinchAction[] => [
			{ type: 'down', id: at, point: { x: 20, y: 10 } },
			{ type: 'up', id: at, point: { x: 20, y: 10 }, view, at },
		];
		const zoomed = run(...tap(1000), ...tap(1200));
		expect(zoomed.zoom.scale).toBe(2.5);
		expect(zoomed.smooth).toBe(true);
		expect(run(...tap(1000), ...tap(1200), ...tap(3000), ...tap(3200)).zoom).toEqual(NO_ZOOM);
		// Too slow: two single taps
		expect(run(...tap(1000), ...tap(1500)).zoom).toEqual(NO_ZOOM);
	});

	it('zooms with the wheel and resets', () => {
		const zoomed = run({ type: 'wheel', point: { x: 0, y: 0 }, view, deltaY: -100, pinch: true });
		expect(zoomed.zoom.scale).toBeCloseTo(Math.E);
		expect(pinchReducer(zoomed, { type: 'reset' }).zoom).toEqual(NO_ZOOM);
	});
});
