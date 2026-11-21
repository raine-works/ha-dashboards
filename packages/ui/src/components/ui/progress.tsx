import { cva, type VariantProps } from 'class-variance-authority';
import React from 'preact/compat';
import { cn } from '../../lib/utils';

// Panel extension: status variants (track tinted with the indicator color)
const progressVariants = cva('relative h-2 w-full overflow-hidden rounded-full', {
	variants: {
		variant: {
			default: 'bg-primary/20 *:bg-primary',
			success: 'bg-success/20 *:bg-success',
			info: 'bg-info/20 *:bg-info',
			warning: 'bg-warning/20 *:bg-warning',
			destructive: 'bg-destructive/20 *:bg-destructive',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof progressVariants> {
	value?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value = 0, variant, ...props }, ref) => (
	<div
		ref={ref}
		role="progressbar"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={value}
		data-slot="progress"
		className={cn(progressVariants({ variant }), className)}
		{...props}
	>
		<div
			data-slot="progress-indicator"
			className="size-full flex-1 transition-all"
			style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
		/>
	</div>
));
Progress.displayName = 'Progress';

export { Progress, progressVariants };
