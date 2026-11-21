import { describe, expect, it } from 'bun:test';
import { dragZoom, isSecondTap, isTap } from '../map-zoom';

describe('isTap', () => {
	it('is a short, still touch', () => {
		expect(isTap({ x: 100, y: 100, time: 0 }, { x: 102, y: 101, time: 90 })).toBe(true);
	});

	it('is not a drag or a hold', () => {
		expect(isTap({ x: 100, y: 100, time: 0 }, { x: 130, y: 100, time: 90 })).toBe(false);
		expect(isTap({ x: 100, y: 100, time: 0 }, { x: 100, y: 100, time: 600 })).toBe(false);
	});
});

describe('isSecondTap', () => {
	const tap = { x: 100, y: 100, time: 1000 };

	it('follows a tap soon after, nearby', () => {
		expect(isSecondTap(tap, { x: 110, y: 95, time: 1150 })).toBe(true);
	});

	it('is not one too late, too far away or without a first tap', () => {
		expect(isSecondTap(tap, { x: 100, y: 100, time: 1400 })).toBe(false);
		expect(isSecondTap(tap, { x: 200, y: 100, time: 1100 })).toBe(false);
		expect(isSecondTap(null, { x: 100, y: 100, time: 1100 })).toBe(false);
	});
});

describe('dragZoom', () => {
	it('zooms in dragging down and out dragging up, a level per 110px', () => {
		expect(dragZoom(12, 110, 0, 19)).toBe(13);
		expect(dragZoom(12, -220, 0, 19)).toBe(10);
		expect(dragZoom(12, 55, 0, 19)).toBe(12.5);
	});

	it('stays within the map’s range', () => {
		expect(dragZoom(18, 500, 0, 19)).toBe(19);
		expect(dragZoom(1, -500, 0, 19)).toBe(0);
	});
});
