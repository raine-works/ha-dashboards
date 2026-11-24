/**
 * Panel extension: a list row swiped sideways to act on it. The gesture is `lib/swipe.ts`'s
 * reducer; this renders it.
 *
 * @module
 */

import type React from 'preact/compat';
import { useEffect, useReducer } from 'preact/compat';
import {
	LONG_PRESS_MS,
	SWIPE_IDLE,
	SWIPE_SETTLE_MS,
	SWIPE_SLOP_PX,
	type SwipeAction,
	type SwipeSide,
	swipeReducer,
} from '../../lib/swipe';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';

/** What a swipe to one side does. */
export interface SwipeRowAction {
	/** "Done", "Delete": shown under the row as it slides away. */
	label: string;
	/** Shown beside the label. */
	icon: React.ReactNode;
	/** The color under the row. */
	tone: 'success' | 'destructive' | 'info';
	/** Runs once the row has slid off. */
	onAction: () => void;
}

/** The row's actions, long press and content. */
export interface SwipeRowProps {
	/** Swiped toward the right (revealed on the left). */
	start?: SwipeRowAction;
	/** Swiped toward the left (revealed on the right). */
	end?: SwipeRowAction;
	/** No swiping or long press. */
	disabled?: boolean;
	/** Held still for half a second (a buzz; the click it ends with is swallowed). */
	onLongPress?: () => void;
	/** The outer element's layout (it's an `li`). */
	className?: string;
	/** The sliding surface: give it its card look (opaque, so the action under it stays hidden). */
	contentClassName?: string;
	/** The row's content. */
	children: React.ReactNode;
	/** Set on the `li` (to find the row again, e.g. while reordering). */
	'data-uid'?: string;
	/** The outer element's own style (a row slid aside while another is dragged past it). */
	style?: React.CSSProperties;
}

// How long the row takes to slide off before its action runs
const SLIDE_OUT_MS = 180;

const TONE = {
	success: 'bg-success text-success-foreground',
	destructive: 'bg-alarm text-alarm-foreground',
	info: 'bg-info text-info-foreground',
} as const;

/**
 * Panel extension: a list row swiped sideways to act on it, like a phone's own lists (Mail, Reminders).
 * Past 40% of its width, or on a quick flick, letting go slides it off and runs that side's action;
 * short of that it springs back (`ease-spring`, its action showing under it until it's home). A buzz as it passes the point where letting go acts. Vertical moves
 * scroll the list (`touch-pan-y`, and nothing moves until the finger goes 8px mostly sideways), taps
 * on the row's own controls still work, and the click after a drag is swallowed. A mouse drags it too.
 * Keep a way to do the same without swiping (the To-do dialog's selection bar). `onLongPress`: held
 * still for `LONG_PRESS_MS`, with a buzz; the click it ends with is swallowed too, and so is the
 * browser's own long-press menu.
 */
export const SwipeRow: React.FC<SwipeRowProps> = ({
	start,
	end,
	disabled,
	onLongPress,
	className,
	contentClassName,
	children,
	'data-uid': uid,
	style,
}) => {
	const sides = { start: !!start && !disabled, end: !!end && !disabled };
	const [state, dispatch] = useReducer(
		(current: typeof SWIPE_IDLE, action: SwipeAction) => swipeReducer(current, action, sides),
		SWIPE_IDLE,
	);
	const { phase, armed, dx } = state;

	// A buzz on passing the commit point either way
	useEffect(() => {
		if (phase === 'dragging' && armed) hapticTap(10);
	}, [armed]);

	// Held without moving: a long press
	useEffect(() => {
		if (phase !== 'pending' || !onLongPress) return;
		const timer = setTimeout(() => {
			dispatch({ type: 'longpress' });
			hapticTap(20);
			onLongPress();
		}, LONG_PRESS_MS);
		return () => clearTimeout(timer);
	}, [phase]);

	// Slid off: run the action, then come back (gone if the action removed the row)
	useEffect(() => {
		if (phase !== 'committed' || !armed) return;
		const action = armed === 'start' ? start : end;
		const timer = setTimeout(() => {
			action?.onAction();
			dispatch({ type: 'reset' });
		}, SLIDE_OUT_MS);
		return () => clearTimeout(timer);
	}, [phase]);

	// Springing back: keep the action under it until it's home, then rest
	useEffect(() => {
		if (phase !== 'settling') return;
		const timer = setTimeout(() => dispatch({ type: 'reset' }), SWIPE_SETTLE_MS);
		return () => clearTimeout(timer);
	}, [phase]);

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (disabled || (!start && !end && !onLongPress) || (e.pointerType === 'mouse' && e.button !== 0)) return;
		const width = (e.currentTarget as HTMLElement).getBoundingClientRect().width;
		dispatch({ type: 'down', x: e.clientX, y: e.clientY, t: e.timeStamp, width });
	};
	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (phase !== 'pending' && phase !== 'dragging') return;
		// Once it's a swipe, the row keeps the pointer (a mouse dragged past its edge)
		const sideways = Math.abs(e.clientX - state.startX);
		if (phase === 'pending' && sideways > SWIPE_SLOP_PX && sideways > Math.abs(e.clientY - state.startY)) {
			const target = e.currentTarget as HTMLElement;
			if (!target.hasPointerCapture(e.pointerId)) target.setPointerCapture(e.pointerId);
		}
		dispatch({ type: 'move', x: e.clientX, y: e.clientY, t: e.timeStamp });
	};
	const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (phase === 'idle') return;
		dispatch({ type: 'up', t: e.timeStamp });
	};
	const onPointerCancel = () => {
		if (phase === 'pending' || phase === 'dragging') dispatch({ type: 'cancel' });
	};
	// Only the row's own capture ending: on touch the finger's implicit capture on what it touched (the
	// text, the checkbox) ends as the row takes the pointer, and that event bubbles up here (it cancelled
	// every swipe on Android)
	const onLostCapture = (e: Event) => {
		if (e.target === e.currentTarget) onPointerCancel();
	};
	// A drag or long press ends with a click on whatever it started on: not a tap
	const onClickCapture = (e: Event) => {
		// A keyboard's click (no pointer, `detail` 0) is always the person's own
		if ((e as MouseEvent).detail === 0) return;
		if (!state.swallowClick && phase !== 'dragging' && phase !== 'committed') return;
		e.stopPropagation();
		e.preventDefault();
	};

	const shownSide: SwipeSide | null =
		phase === 'committed' ? armed : phase === 'settling' ? state.settleFrom : dx > 0 ? 'start' : dx < 0 ? 'end' : null;
	const action = shownSide === 'start' ? start : shownSide === 'end' ? end : undefined;
	const offset = phase === 'committed' ? (armed === 'start' ? '100%' : '-100%') : `${dx}px`;
	const moving = phase === 'dragging';

	return (
		<li
			data-uid={uid}
			data-slot="swipe-row"
			style={style}
			className={cn('relative isolate overflow-hidden rounded-lg', className)}
		>
			{action && (
				<div
					aria-hidden
					className={cn(
						'absolute inset-0 -z-10 flex items-center gap-2 px-5 font-medium text-sm transition-opacity',
						shownSide === 'end' && 'flex-row-reverse',
						TONE[action.tone],
						!armed && 'opacity-60',
					)}
				>
					<span
						className={cn(
							'flex items-center gap-2 transition-transform duration-150 motion-reduce:transition-none [&_svg]:size-5',
							armed && 'scale-110',
							shownSide === 'end' && 'flex-row-reverse',
						)}
					>
						{action.icon}
						{action.label}
					</span>
				</div>
			)}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: a gesture surface; its swipe and long press have buttons of their own (the selection bar) */}
			<div
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerCancel}
				onLostPointerCapture={onLostCapture}
				onClickCapture={onClickCapture}
				onContextMenu={onLongPress ? (e: Event) => e.preventDefault() : undefined}
				style={{ transform: `translateX(${offset})` }}
				className={cn(
					'touch-pan-y',
					!moving && 'transition-transform motion-reduce:transition-none',
					// Letting go short of acting springs back past its place a little; sliding off is quick
					phase === 'settling' ? 'duration-450 ease-spring' : 'duration-200 ease-out',
					contentClassName,
				)}
			>
				{children}
			</div>
		</li>
	);
};
