/**
 * Sliders that don't jump back: a control's value held while it's dragged, and after it's
 * released until Home Assistant reports it.
 */

import { useEffect, useState } from 'preact/compat';

// Give up waiting for Home Assistant to report a set value after this long
const HOLD_TIMEOUT_MS = 10_000;

/** A held value and its setters (`useHold`): what's shown instead of the reported value. */
export interface Hold {
	/** The value shown instead of the reported one (null: the reported one). */
	held: { value: number; committed: boolean } | null;
	/** Dragging: show this. */
	hold: (value: number) => void;
	/** Released (and sent): show it until Home Assistant reports it. */
	commit: (value: number) => void;
	/** Show the reported value again. */
	release: () => void;
}

/**
 * `useHeldValue`'s state on its own, for a value whose reported side ticks in a child (a track's
 * seek bar): the parent keeps the hold and the child settles it (`useSettledHold`), so the tick
 * re-renders only the child.
 */
export function useHold(): Hold {
	const [held, setHeld] = useState<Hold['held']>(null);

	useEffect(() => {
		if (!held?.committed) return;
		const timer = setTimeout(() => setHeld(null), HOLD_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [held]);

	return {
		held,
		hold: (value) => setHeld({ value, committed: false }),
		commit: (value) => setHeld({ value, committed: true }),
		release: () => setHeld(null),
	};
}

/** Drops a committed hold once Home Assistant reports it (`settled`). */
export function useSettledHold(hold: Hold, reported: number, settled: (held: number, reported: number) => boolean) {
	const { held, release } = hold;
	useEffect(() => {
		if (held?.committed && settled(held.value, reported)) release();
	}, [reported, held]);
}

/**
 * A control's shown value (a slider): the drag position while dragging, then the committed value
 * until Home Assistant reports it (`settled`), so it never jumps back to the old value and forward
 * again while a slow device catches up. Falls back to the reported value after a timeout.
 */
export function useHeldValue(reported: number, settled: (held: number, reported: number) => boolean) {
	const hold = useHold();
	useSettledHold(hold, reported, settled);
	return {
		value: hold.held?.value ?? reported,
		/** Dragging: show this. */
		hold: hold.hold,
		/** Released (and sent): show it until Home Assistant reports it. */
		commit: hold.commit,
		/** Whether a set value is still on its way. */
		pending: !!hold.held?.committed,
	};
}
