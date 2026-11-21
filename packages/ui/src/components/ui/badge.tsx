import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
	'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-primary text-primary-foreground',
				secondary: 'border-transparent bg-secondary text-secondary-foreground',
				destructive:
					'border-transparent bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
				outline: 'text-foreground',
				// Panel extension: matches the Button `warning` variant (open doors, attention states)
				warning: 'border-warning/60 bg-warning/15 text-warning',
				// Same weight for "home" and "in a zone" presence
				success: 'border-success/60 bg-success/15 text-success',
				info: 'border-info/60 bg-info/15 text-info',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
