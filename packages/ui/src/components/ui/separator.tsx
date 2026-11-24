/**
 * shadcn/ui's Separator (new-york v4), ported to Preact without Radix.
 *
 * @module
 */

import React from 'preact/compat';
import { cn } from '../../lib/utils';

/** A div's attributes, the line's direction and whether assistive technology skips it. */
export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Default: horizontal. */
	orientation?: 'horizontal' | 'vertical';
	/** Only visual (`role="none"`, the default), else a `separator` screen readers announce. */
	decorative?: boolean;
}

/** A hairline between content, in the border color. */
export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
	({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
		<div
			ref={ref}
			{...(decorative ? { role: 'none' } : { role: 'separator', 'aria-orientation': orientation })}
			data-slot="separator"
			data-orientation={orientation}
			className={cn(
				'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
				className,
			)}
			{...props}
		/>
	),
);
Separator.displayName = 'Separator';
