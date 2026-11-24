/**
 * Panel extension (not shadcn): an iOS-style picker wheel. A native scroll-snap column (the
 * platform's own momentum and settle), the value in a band across the middle, rows fading toward the
 * edges, a light haptic tick as each value passes the middle. Arrow keys step it; tapping a row picks it.
 *
 * @module
 */

import { useEffect, useState } from 'preact/compat';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';

/** A row's height; the wheel shows five (two above and below the value). */
const ROW_PX = 40;

/** The wheel's rows and the value picked (controlled). */
export interface WheelPickerProps<T extends string | number> {
	/** The rows, top to bottom: each value and what it shows. */
	items: { value: T; label: string }[];
	/** The value in the middle band (the first row when it isn't one of `items`). */
	value: T;
	/** A new value reached the middle (scrolled, stepped or tapped). */
	onChange: (value: T) => void;
	/** What the wheel picks ("Hour"), for screen readers. */
	label: string;
	className?: string;
}

// The first scroll to the value is instant, later ones smooth (outside the component: the React
// Compiler won't compile one that changes an element it holds in state)
const markReady = (el: HTMLElement) => {
	el.dataset.ready = '1';
};

/** A wheel of `items` to scroll to a value (`role="listbox"`). */
export function WheelPicker<T extends string | number>({
	items,
	value,
	onChange,
	label,
	className,
}: WheelPickerProps<T>) {
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	const index = Math.max(
		0,
		items.findIndex((item) => item.value === value),
	);
	// The row in the middle as it scrolls (styles and ticks follow the finger, not the commit)
	const [middle, setMiddle] = useState(index);

	// Bring the value to the middle: at once when the wheel appears, smoothly when it's set from outside
	// (a key, a tap); a value the wheel itself scrolled to is already there
	useEffect(() => {
		if (!scroller) return;
		if (Math.round(scroller.scrollTop / ROW_PX) !== index) {
			scroller.scrollTo({ top: index * ROW_PX, behavior: scroller.dataset.ready ? 'smooth' : 'instant' });
		}
		markReady(scroller);
		setMiddle(index);
	}, [scroller, index]);

	const step = (by: number) => onChange(items[Math.min(items.length - 1, Math.max(0, index + by))].value);

	return (
		<div
			role="listbox"
			aria-label={label}
			aria-activedescendant={`${label}-${index}`}
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					step(e.key === 'ArrowUp' ? -1 : 1);
				}
			}}
			data-slot="wheel-picker"
			className={cn(
				'relative h-50 w-16 shrink-0 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
				className,
			)}
		>
			{/* The value's band */}
			<div className="pointer-events-none absolute inset-x-0 top-20 h-10 rounded-lg bg-accent" />
			<div
				ref={setScroller}
				onScroll={(e) => {
					const at = Math.min(items.length - 1, Math.max(0, Math.round(e.currentTarget.scrollTop / ROW_PX)));
					if (at === middle) return;
					setMiddle(at);
					hapticTap(5);
					onChange(items[at].value);
				}}
				className="mask-[linear-gradient(to_bottom,transparent,black_35%,black_65%,transparent)] scrollbar-none relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain py-20"
			>
				{items.map((item, i) => {
					const away = Math.abs(i - middle);
					return (
						// biome-ignore lint/a11y/useKeyWithClickEvents: a tap shortcut; the keys go to the listbox around it
						<div
							key={item.value}
							id={`${label}-${i}`}
							role="option"
							aria-selected={i === index}
							tabIndex={-1}
							onClick={() => onChange(item.value)}
							className={cn(
								'flex h-10 snap-center items-center justify-center text-lg tabular-nums transition-colors',
								away === 0 ? 'font-semibold text-foreground' : away === 1 ? 'text-foreground/55' : 'text-foreground/25',
							)}
						>
							{item.label}
						</div>
					);
				})}
			</div>
		</div>
	);
}
