/**
 * Panel extension: numbers that roll to their new value when it changes (a thermostat's setpoint, the
 * outside temperature, a count, a countdown), on NumberFlow's `<number-flow>` element.
 *
 * NumberFlow's own React wrapper (`@number-flow/react`) isn't used: it sniffs `React.version` and,
 * under preact/compat (which reports React 18), hands the element its data as a JSON string through a
 * property, which Preact sets as is. The element itself is framework-free, so this sets its
 * properties and calls `update()` directly. It draws in a ShadowRoot of its own, with its own styles,
 * so it works inside the card's; it's `role="img"` labelled with the formatted value, so a screen
 * reader reads the number, never the rolling digits.
 *
 * @module
 */

import NumberFlowElement, { type Digits, type Trend } from 'number-flow';
import type React from 'preact/compat';
import { useLayoutEffect, useRef } from 'preact/compat';
import { type ClockParts, clockParts, formatClock } from '../../lib/time';
import { cn } from '../../lib/utils';

declare module 'preact' {
	namespace JSX {
		interface IntrinsicElements {
			/** NumberFlow's element (`number-flow`), defined on import. */
			'number-flow': HTMLAttributes<NumberFlowElement>;
		}
	}
}

// Defined by the import above (`customElements.define('number-flow', …)`, skipped when a bundle loaded
// before this one already did); naming it keeps the import from being dropped as unused
const ELEMENT = NumberFlowElement;

/** The number, how it's written, and how it moves. */
export interface NumberFlowProps {
	/** The number shown; a change rolls the digits that changed. */
	value: number;
	/** How it's written (`Intl.NumberFormat`'s options: decimals, a percent, a unit, `minimumIntegerDigits`). */
	format?: Intl.NumberFormatOptions;
	/** Before the number, inside the element ("$"). */
	prefix?: string;
	/** After the number, inside the element ("°"). */
	suffix?: string;
	/**
	 * Which way the digits roll: up for a bigger number and down for a smaller one (the default), or
	 * always one way (`-1` for a countdown, so 0:00 → 0:59 still rolls down).
	 */
	trend?: Trend;
	/** The highest each place goes, by place (`{ 1: { max: 5 } }`: a clock's tens of seconds). */
	digits?: Digits;
	/** Roll (the default) or just change. Reduced motion is respected either way. */
	animated?: boolean;
	/** Layout and type; it's inline, in the surrounding font. */
	className?: string;
}

/**
 * A number that rolls to its new value when it changes, like a mechanical counter. Inline, in the
 * surrounding font and color; give its box `tabular-nums` where its width mustn't change.
 */
export const NumberFlow: React.FC<NumberFlowProps> = ({
	value,
	format,
	prefix,
	suffix,
	trend,
	digits,
	animated = true,
	className,
}) => {
	const ref = useRef<NumberFlowElement | null>(null);
	// Options compare by what they say: callers pass object literals, new on every render
	const formatKey = JSON.stringify(format ?? null);
	const digitsKey = JSON.stringify(digits ?? null);

	// Before paint, so the first frame already shows the number (the element is empty until its first update)
	useLayoutEffect(() => {
		const el = ref.current;
		// Whichever bundle defined the element, it has `update()` (a newer build's page can keep the first one's)
		if (typeof el?.update !== 'function') return;
		el.format = formatKey === 'null' ? undefined : JSON.parse(formatKey);
		el.digits = digitsKey === 'null' ? undefined : JSON.parse(digitsKey);
		el.numberPrefix = prefix;
		el.numberSuffix = suffix;
		el.trend = trend ?? ELEMENT.defaultProps.trend;
		el.animated = animated;
		el.update(value);
	}, [value, formatKey, digitsKey, prefix, suffix, trend, animated]);

	return <number-flow ref={ref} data-slot="number-flow" className={className} />;
};

/** A clock's length, how it moves, and its layout. */
export interface NumberFlowClockProps {
	/** Seconds; written "0:07", "3:05", "1:02:09" (`formatClock`). */
	seconds: number;
	/** Which way it rolls: `-1` for a countdown. */
	trend?: Trend;
	/** Layout and type. */
	className?: string;
}

const TWO_DIGITS: Intl.NumberFormatOptions = { minimumIntegerDigits: 2 };
// A clock's tens of minutes and seconds go up to 5 (59 → 00 rolls one place, not through 6–9)
const SIXTY: Digits = { 1: { max: 5 } };

/**
 * A length of time as a clock ("3:05") whose digits roll as it counts: hours (when there are any),
 * minutes and seconds each a `NumberFlow`, the colons fixed between them. Named as one clock for
 * screen readers.
 */
export const NumberFlowClock: React.FC<NumberFlowClockProps> = ({ seconds, trend, className }) => {
	const parts: ClockParts = clockParts(seconds);
	return (
		// One name for the whole clock ("3:05"), not its three numbers one by one
		<span
			role="img"
			aria-label={formatClock(seconds)}
			data-slot="number-flow-clock"
			className={cn('inline-flex items-baseline tabular-nums', className)}
		>
			{parts.hours > 0 && (
				<>
					<NumberFlow value={parts.hours} trend={trend} />:
				</>
			)}
			<NumberFlow
				value={parts.minutes}
				trend={trend}
				format={parts.hours > 0 ? TWO_DIGITS : undefined}
				digits={parts.hours > 0 ? SIXTY : undefined}
			/>
			:
			<NumberFlow value={parts.seconds} trend={trend} format={TWO_DIGITS} digits={SIXTY} />
		</span>
	);
};
