/**
 * Panel design (not shadcn's thin track and round thumb): a thick slider for brightness, volume
 * and the like, safe to scroll past on touch.
 *
 * @module
 */

import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';

// How far a finger moves before it counts as a drag (sideways) or a scroll (up/down)
const TOUCH_SLOP_PX = 8;
// The grip's inset from the fill's end (and the track's ends), so it stays inside a rounded corner
const GRIP_INSET_PX = 6;

/** The slider's props (controlled). */
export interface SliderProps {
	/** The value shown (a drag shows its own until the new value comes back). */
	value: number;
	/** Default: 1. */
	min?: number;
	/** Default: 100. */
	max?: number;
	/** Values snap to it (default: 1). */
	step?: number;
	/** Can't be changed. */
	disabled?: boolean;
	/** Each new value while dragging (and each keyboard step). */
	onValueChange?: (val: number) => void;
	/** The value let go on (and each keyboard step): the one to send to Home Assistant. */
	onValueCommit?: (val: number) => void;
	className?: string;
	/** Panel extension: paint the track (a color-temperature or hue gradient). */
	trackClassName?: string;
	/** Classes for the fill (transparent over a painted track). */
	rangeClassName?: string;
	'aria-label'?: string;
}

/**
 * A thick bar (the theme's control radius, like the buttons beside it) filled up to its value, with
 * a slim grip line just inside the fill's end that grows while dragged or stepped with the keyboard
 * (and marks the value on a painted track, where the fill is transparent). Touch only changes it on a deliberate sideways drag (a scroll or a tap that starts
 * on it leaves it alone); a mouse jumps to the click; the keyboard steps with arrows, Page Up/Down
 * (10%), Home and End.
 */
export const Slider: React.FC<SliderProps> = ({
	value,
	min = 1,
	max = 100,
	step = 1,
	disabled = false,
	onValueChange,
	onValueCommit,
	className,
	trackClassName,
	rangeClassName,
	'aria-label': ariaLabel,
}) => {
	const rootRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [dragValue, setDragValue] = useState<number | null>(null);
	const [keyboardFocus, setKeyboardFocus] = useState(false);

	// Drop the local value once the drag ends and the new value comes back from the parent
	useEffect(() => {
		if (!isDragging) setDragValue(null);
	}, [value, isDragging]);

	const activeVal = dragValue ?? value;
	const fraction = Math.min(Math.max((activeVal - min) / (max - min), 0), 1);
	const fill = `${fraction * 100}%`;
	// Inside the fill's end, never past the track's ends
	const grip = `clamp(${GRIP_INSET_PX}px, calc(${fill} - ${GRIP_INSET_PX}px), calc(100% - ${GRIP_INSET_PX}px))`;

	const clamp = (v: number) => {
		const stepped = min + Math.round((v - min) / step) * step;
		return Math.min(max, Math.max(min, Math.round(stepped * 1000) / 1000));
	};

	const valueAt = (clientX: number) => {
		const rect = rootRef.current?.getBoundingClientRect();
		if (!rect) return activeVal;
		const pct = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
		return clamp(min + pct * (max - min));
	};

	// A light tick each tenth of the way while dragging (phones), and a firmer one on letting go
	const tickRef = useRef<number | null>(null);
	const tenth = (v: number) => Math.floor(((v - min) / (max - min || 1)) * 10);

	const preview = (v: number) => {
		const bucket = tenth(v);
		if (tickRef.current !== null && bucket !== tickRef.current) hapticTap(6);
		tickRef.current = bucket;
		// Only a new value: a finger moving within one step re-renders nothing (the owner of a light
		// list or a dialog re-rendered on every pointer move)
		if (v === dragValue) return;
		setDragValue(v);
		onValueChange?.(v);
	};

	// Touch: nothing changes until the finger moves sideways on purpose, so a scroll that starts on
	// the slider (or a tap to stop one) never changes it; vertical moves are left to the page
	const touchStart = useRef<{ x: number; y: number } | null>(null);

	const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		setIsDragging(true);
		preview(valueAt(e.clientX));
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (disabled) return;
		setKeyboardFocus(false);
		if (e.pointerType === 'touch' || e.pointerType === 'pen') {
			touchStart.current = { x: e.clientX, y: e.clientY };
			return;
		}
		e.preventDefault();
		(e.currentTarget as HTMLElement).focus({ preventScroll: true });
		startDrag(e);
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (disabled) return;
		const start = touchStart.current;
		if (start && !isDragging) {
			const dx = Math.abs(e.clientX - start.x);
			const dy = Math.abs(e.clientY - start.y);
			if (dy > TOUCH_SLOP_PX && dy >= dx)
				touchStart.current = null; // a scroll: let the page have it
			else if (dx > TOUCH_SLOP_PX && dx > dy) {
				touchStart.current = null;
				startDrag(e);
			}
			return;
		}
		if (isDragging) preview(valueAt(e.clientX));
	};

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		touchStart.current = null;
		if (disabled || !isDragging) return;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {}
		setIsDragging(false);
		tickRef.current = null;
		hapticTap();
		onValueCommit?.(activeVal);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (disabled) return;
		const big = Math.max(step, (max - min) / 10);
		const next: Record<string, number> = {
			ArrowRight: activeVal + step,
			ArrowUp: activeVal + step,
			ArrowLeft: activeVal - step,
			ArrowDown: activeVal - step,
			PageUp: activeVal + big,
			PageDown: activeVal - big,
			Home: min,
			End: max,
		};
		if (!(e.key in next)) return;
		e.preventDefault();
		setKeyboardFocus(true);
		const v = clamp(next[e.key]);
		if (v === activeVal) return;
		hapticTap(6);
		onValueChange?.(v);
		onValueCommit?.(v);
	};

	const active = isDragging || keyboardFocus;

	return (
		<div
			ref={rootRef}
			role="slider"
			tabIndex={disabled ? -1 : 0}
			data-slot="slider"
			data-disabled={disabled ? '' : undefined}
			data-dragging={isDragging ? '' : undefined}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={activeVal}
			aria-disabled={disabled}
			aria-label={ariaLabel}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onKeyDown={handleKeyDown}
			onBlur={() => setKeyboardFocus(false)}
			className={cn(
				// py-2 makes a 48px-tall touch target around the 32px bar
				'group/slider relative flex w-full cursor-pointer touch-pan-y select-none items-center py-2 outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50',
				className,
			)}
		>
			<div
				data-slot="slider-track"
				data-active={active ? '' : undefined}
				className={cn(
					'relative h-8 w-full grow overflow-hidden rounded-md bg-muted ring-primary/25 transition-shadow duration-150 group-focus-visible/slider:ring-4 data-active:ring-4',
					trackClassName,
				)}
			>
				{/* Square at its end: the bar's corners round it at the ends */}
				<div
					data-slot="slider-range"
					className={cn('absolute inset-y-0 left-0 bg-primary', rangeClassName)}
					style={{ width: fill }}
				/>
				<div
					data-slot="slider-thumb"
					data-active={active ? '' : undefined}
					className="-translate-1/2 pointer-events-none absolute top-1/2 h-4 w-1 rounded-full bg-white shadow-sm ring-1 ring-black/15 transition-[height] duration-150 data-active:h-6"
					style={{ left: grip }}
				/>
			</div>
		</div>
	);
};
