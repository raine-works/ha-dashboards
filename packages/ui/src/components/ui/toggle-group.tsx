/**
 * shadcn/ui's ToggleGroup (new-york v4), ported to Preact without Radix: single-select only, with
 * an `xl` size for wall panels.
 *
 * @module
 */

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'preact/compat';
import { cn } from '../../lib/utils';

/** shadcn's Toggle classes by `variant` and `size`, which the group's items use. */
const toggleVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,box-shadow] hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: 'bg-transparent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
				// The segmented control (docs/design/components.md), as Tabs draw it: in a group, a muted track
				// (the group's) with the picked item raised on it
				outline:
					'bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm',
				// Panel extension: a toggle on its own (Play on's speakers, a message's people): tonal, filled while on
				chip: 'rounded-control bg-secondary text-secondary-foreground hover:bg-secondary/80 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90',
			},
			size: {
				default: 'h-9 touch:h-11 min-w-9 touch:min-w-11 px-2 touch:text-base',
				sm: 'h-8 touch:h-11 min-w-8 touch:min-w-11 px-1.5',
				lg: 'h-10 touch:h-12 min-w-10 touch:min-w-12 px-2.5 touch:text-base',
				// Touch-friendly wall panel size (44px+ hit target)
				xl: 'h-12 min-w-12 px-3 text-base',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

type ToggleVariantProps = VariantProps<typeof toggleVariants>;

interface ToggleGroupContextValue extends ToggleVariantProps {
	value: string;
	onValueChange: (value: string) => void;
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
	value: '',
	onValueChange: () => {},
	variant: 'default',
	size: 'default',
});

/** A div's attributes, the items' `variant` and `size`, and the picked value (controlled). */
export interface ToggleGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>, ToggleVariantProps {
	/** Single-select value. */
	value: string;
	/** An item was tapped: its value. */
	onValueChange: (value: string) => void;
}

/** A row of joined toggles, one of them on. */
const ToggleGroup: React.FC<ToggleGroupProps> = ({
	className,
	variant,
	size,
	value,
	onValueChange,
	children,
	...props
}) => (
	<div
		role="group"
		data-slot="toggle-group"
		data-variant={variant}
		data-size={size}
		className={cn(
			'group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:gap-1 data-[variant=outline]:rounded-control data-[variant=outline]:bg-muted data-[variant=outline]:p-1',
			className,
		)}
		{...props}
	>
		<ToggleGroupContext.Provider value={{ value, onValueChange, variant, size }}>
			{children}
		</ToggleGroupContext.Provider>
	</div>
);

/** A button's attributes and the item's value (the group's `variant` and `size` win over its own). */
export interface ToggleGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ToggleVariantProps {
	/** What picking it sets the group to. */
	value: string;
}

/** One of the group's toggles (`aria-pressed`, `data-state="on"` while picked). */
const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
	({ className, children, variant, size, value, ...props }, ref) => {
		const context = React.useContext(ToggleGroupContext);
		const isOn = context.value === value;
		const resolvedVariant = context.variant || variant;
		const resolvedSize = context.size || size;

		return (
			<button
				ref={ref}
				type="button"
				aria-pressed={isOn}
				data-slot="toggle-group-item"
				data-state={isOn ? 'on' : 'off'}
				data-variant={resolvedVariant}
				data-size={resolvedSize}
				onClick={() => context.onValueChange(value)}
				className={cn(
					toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
					'min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:rounded-chip',
					className,
				)}
				{...props}
			>
				{children}
			</button>
		);
	},
);
ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem, toggleVariants };
