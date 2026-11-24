/**
 * Panel extension: a count on a header button's corner.
 *
 * @module
 */

import type React from 'preact/compat';

/**
 * Panel extension: a count on the corner of a header button (notifications, open to-dos, TVs that
 * are on). The button it sits in is `relative`.
 */
export const CountBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[11px] text-primary-foreground tabular-nums">
		{children}
	</span>
);
