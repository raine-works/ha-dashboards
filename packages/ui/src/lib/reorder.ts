/**
 * Drag to reorder a list of rows (the music queue, the to-do list): where a row dragged `dy`
 * pixels lands, how far each other row slides to make room for it, and the scroll near an edge.
 *
 * @module
 */

/** The index a row dragged from `from` by `dy` pixels lands on, within `count` rows of `rowHeight`. */
export function dragTarget(from: number, dy: number, rowHeight: number, count: number): number {
	if (rowHeight <= 0 || count <= 0) return from;
	return Math.min(count - 1, Math.max(0, from + Math.round(dy / rowHeight)));
}

/**
 * How far row `index` slides while the row at `from` is held over `to`: the rows it passed move
 * one row the other way (up when dragging down, down when dragging up); the rest stay.
 */
export function dragShift(index: number, from: number, to: number, rowHeight: number): number {
	if (index === from) return 0;
	if (from < to && index > from && index <= to) return -rowHeight;
	if (to < from && index >= to && index < from) return rowHeight;
	return 0;
}

/**
 * How fast to scroll while a dragged row is held near an edge of the visible area (`top`..`bottom`):
 * up to `max` pixels a frame inside `edge` of either end, faster nearer it; 0 elsewhere.
 */
export function edgeScroll(y: number, top: number, bottom: number, edge = 56, max = 14): number {
	if (y < top + edge) return -Math.ceil((max * (top + edge - y)) / edge);
	if (y > bottom - edge) return Math.ceil((max * (y - (bottom - edge))) / edge);
	return 0;
}

/**
 * Where a row of varying height lands (the to-do list): the row at `from`, dragged `dy` pixels, takes
 * the place of the farthest row whose middle its own middle has passed. `tops` and `heights` are the
 * rows' as the drag started.
 */
export function dragTargetAt(tops: number[], heights: number[], from: number, dy: number): number {
	if (from < 0 || from >= tops.length) return from;
	const middle = tops[from] + heights[from] / 2 + dy;
	let to = from;
	for (let i = from + 1; i < tops.length; i++) if (middle > tops[i] + heights[i] / 2) to = i;
	for (let i = from - 1; i >= 0; i--) if (middle < tops[i] + heights[i] / 2) to = i;
	return to;
}

/** `items` with the one at `from` moved to `to`. */
export function moveIndex<T>(items: T[], from: number, to: number): T[] {
	const next = [...items];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}
