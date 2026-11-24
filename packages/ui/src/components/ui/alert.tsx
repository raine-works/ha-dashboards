/**
 * shadcn/ui's Alert (new-york v4), ported to Preact, with a `warning` variant of the panel's own.
 *
 * @module
 */

import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';

/** The alert's classes by variant: `default`, `destructive` and `warning` (something needs attention). */
const alertVariants = cva(
	'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
	{
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				destructive:
					'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current',
				// Panel extension: matches the Button/Badge `warning` variants (something needs attention)
				warning: 'border-warning/60 bg-warning/15 text-warning *:data-[slot=alert-description]:text-warning/90',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

/** A div's attributes and the alert's `variant`. */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

/** A callout (`role="alert"`): an optional leading icon, an `AlertTitle` and an `AlertDescription`. */
function Alert({ className, variant, ...props }: AlertProps) {
	return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

/** The alert's one-line title. */
function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-slot="alert-title"
			className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
			{...props}
		/>
	);
}

/** The alert's body, in muted text (paragraphs allowed). */
function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-slot="alert-description"
			className={cn(
				'col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm [&_p]:leading-relaxed',
				className,
			)}
			{...props}
		/>
	);
}

export { Alert, AlertDescription, AlertTitle, alertVariants };
