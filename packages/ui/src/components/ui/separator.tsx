import React from 'preact/compat';
import { cn } from '../../lib/utils';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
	orientation?: 'horizontal' | 'vertical';
	decorative?: boolean;
}

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
