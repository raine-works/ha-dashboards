/**
 * shadcn/ui's Button (new-york v4), ported to Preact, with the panel's extensions: the `warning`
 * and `assist` variants, the larger sizes for wall panels and full screen video, the PIN pad's
 * keys, and a `loading` state.
 *
 * @module
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import React from 'preact/compat';
import { cn } from '../../lib/utils';

/** The button's classes by `variant` and `size`. */
const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90',
				destructive:
					'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
				outline:
					'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				// Panel extension: status variants backed by the theme's status tokens
				// Outline weight (like `outline`) tinted with the status color, so it sits evenly beside outline buttons
				warning: 'border border-warning/60 bg-warning/15 text-warning shadow-xs hover:bg-warning/25',
				// Panel extension: the Assist button, the one control in the Assist colors (a gradient ring
				// over a tinted fill, filled while pressed: `.assist-button` in theme.css)
				assist: 'assist-button shadow-xs',
				ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				// Text sizes lift icons 1px: next to Geist text, icons sit ~1px below the cap
				// height (measured). Icon-only sizes stay geometrically centered.
				// `touch:` (wall panels): a size up for fingers, nothing under 44px
				default:
					"h-9 touch:h-11 px-4 py-2 touch:text-base has-[>svg]:px-3 touch:[&_svg:not([class*='size-'])]:size-5 [&_svg]:-translate-y-px",
				sm: 'h-8 touch:h-11 touch:min-w-11 gap-1.5 rounded-md px-3 touch:px-4 has-[>svg]:px-2.5 touch:has-[>svg]:px-3 [&_svg]:-translate-y-px',
				lg: "h-10 touch:h-12 rounded-md px-6 touch:text-base has-[>svg]:px-4 max-lg:gap-1.5 touch:[&_svg:not([class*='size-'])]:size-5 [&_svg]:-translate-y-px",
				// Touch-friendly wall panel size (44px+ hit target). Below lg (the 10.5" panels) the icon sits
				// closer to its label, leaving the room to the button's sides
				xl: 'h-12 rounded-lg px-6 text-base has-[>svg]:px-5 max-lg:gap-1.5 [&_svg]:-translate-y-px',
				// Full screen video controls (a phone held away, a laptop across the room): 56px targets
				'2xl':
					"h-14 rounded-xl px-6 text-lg has-[>svg]:px-5 [&_svg:not([class*='size-'])]:size-6 [&_svg]:-translate-y-px",
				// The wall panel and desktop header's buttons: the icon over a short label ("To-do", "Cameras"),
				// so every button says what it opens, 56px tall and as narrow as its label
				tile: "h-14 min-w-14 flex-col gap-1 px-2 font-medium text-[11px] leading-none has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-5",
				// The PIN pad's round keys, like a phone's own: bigger on phones, smaller on a short screen
				pad: 'short:size-14 size-16 flex-col gap-0 rounded-full font-normal short:text-2xl text-3xl leading-none max-sm:size-[min(5.5rem,22vw,10svh)] max-sm:text-4xl',
				icon: "size-9 touch:size-11 touch:[&_svg:not([class*='size-'])]:size-5",
				'icon-sm': 'size-8 touch:size-11',
				'icon-lg': "size-10 touch:size-12 touch:[&_svg:not([class*='size-'])]:size-5",
				'icon-xl': 'size-12 rounded-lg',
				'icon-2xl': "size-14 rounded-xl [&_svg:not([class*='size-'])]:size-6",
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

/** A button's attributes, its `variant` and `size`, and whether it's busy. */
export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	/**
	 * Panel extension: an action is in flight. After a moment (so quick ones don't flash) the
	 * content hides in place under a spinner, keeping the button's size; clicks are ignored
	 * meanwhile. Pass it (even `false`) on any button that can be busy, so its markup stays the same.
	 */
	loading?: boolean;
}

/** A button (`type="button"` unless given another), with a spinner while `loading`. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, loading, children, onClick, ...props }, ref) => {
		if (loading === undefined) {
			return (
				<button
					ref={ref}
					type="button"
					data-slot="button"
					data-variant={variant ?? 'default'}
					data-size={size ?? 'default'}
					className={cn(buttonVariants({ variant, size, className }))}
					onClick={onClick}
					{...props}
				>
					{children}
				</button>
			);
		}
		return (
			<button
				ref={ref}
				type="button"
				data-slot="button"
				data-variant={variant ?? 'default'}
				data-size={size ?? 'default'}
				data-loading={loading || undefined}
				aria-busy={loading || undefined}
				className={cn(buttonVariants({ variant, size, className }), 'relative')}
				onClick={loading ? undefined : onClick}
				{...props}
			>
				{/* Bare text in a span, so it can hide like the icons (same flex layout either way) */}
				{React.Children.map(children, (child) =>
					typeof child === 'string' || typeof child === 'number' ? <span>{child}</span> : child,
				)}
				{loading && (
					<span data-slot="button-spinner" aria-hidden className="absolute inset-0 flex items-center justify-center">
						<Loader2 className={cn('animate-spin', size === 'xl' || size === 'icon-xl' ? 'size-5' : 'size-4')} />
					</span>
				)}
			</button>
		);
	},
);
Button.displayName = 'Button';

export { Button, buttonVariants };
