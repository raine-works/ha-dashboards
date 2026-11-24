/**
 * Panel extension: a label that changes without changing size.
 *
 * @module
 */

import type React from 'preact/compat';
import { cn } from '../../lib/utils';

/** The label's texts and which one shows. */
export interface StableLabelProps {
	/** Every text the label can show; it's as wide as the widest, so switching never resizes it. */
	options: readonly React.ReactNode[];
	/** The one shown (an index into `options`). */
	value: number;
	className?: string;
}

/**
 * Panel extension: a label that changes ("Clear queue" → "Tap to clear", "Arm" → "Arming…")
 * without changing size. All options share one grid cell; the others are laid out but invisible
 * (and hidden from screen readers), so the widest sets the width.
 */
export const StableLabel: React.FC<StableLabelProps> = ({ options, value, className }) => (
	<span data-slot="stable-label" className={cn('inline-grid', className)}>
		{options.map((option, i) => (
			<span
				key={i}
				aria-hidden={i !== value || undefined}
				className={cn('col-start-1 row-start-1', i !== value && 'invisible')}
			>
				{option}
			</span>
		))}
	</span>
);
