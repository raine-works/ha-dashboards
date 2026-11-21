import { describe, expect, it } from 'bun:test';
import { dragShift, dragTarget, dragTargetAt, edgeScroll, moveIndex } from '../reorder';

describe('dragTarget', () => {
	it('lands a row whole rows away, within the list', () => {
		expect(dragTarget(2, 0, 60, 5)).toBe(2);
		expect(dragTarget(2, 29, 60, 5)).toBe(2);
		expect(dragTarget(2, 31, 60, 5)).toBe(3);
		expect(dragTarget(2, -125, 60, 5)).toBe(0);
		expect(dragTarget(2, 900, 60, 5)).toBe(4);
	});
});

describe('dragShift', () => {
	it('moves the rows passed over the other way', () => {
		// Row 1 dragged down to 3: rows 2 and 3 move up
		expect([0, 1, 2, 3, 4].map((i) => dragShift(i, 1, 3, 60))).toEqual([0, 0, -60, -60, 0]);
		// Row 3 dragged up to 1: rows 1 and 2 move down
		expect([0, 1, 2, 3, 4].map((i) => dragShift(i, 3, 1, 60))).toEqual([0, 60, 60, 0, 0]);
		expect([0, 1, 2].map((i) => dragShift(i, 1, 1, 60))).toEqual([0, 0, 0]);
	});
});

describe('edgeScroll', () => {
	it('scrolls faster nearer an edge, not in the middle', () => {
		expect(edgeScroll(300, 0, 600)).toBe(0);
		expect(edgeScroll(0, 0, 600)).toBe(-14);
		expect(edgeScroll(28, 0, 600)).toBe(-7);
		expect(edgeScroll(600, 0, 600)).toBe(14);
	});
});

describe('dragTargetAt', () => {
	// Rows of 50, 90 (a note) and 50px, 8px apart
	const tops = [0, 58, 156];
	const heights = [50, 90, 50];

	it("passes a row once its middle crosses that row's middle", () => {
		expect(dragTargetAt(tops, heights, 0, 70)).toBe(0);
		expect(dragTargetAt(tops, heights, 0, 80)).toBe(1);
		expect(dragTargetAt(tops, heights, 0, 160)).toBe(2);
		expect(dragTargetAt(tops, heights, 2, -60)).toBe(2);
		expect(dragTargetAt(tops, heights, 2, -80)).toBe(1);
		expect(dragTargetAt(tops, heights, 2, -400)).toBe(0);
	});
});

describe('moveIndex', () => {
	it('moves one item', () => {
		expect(moveIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
		expect(moveIndex(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
	});
});
