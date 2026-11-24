/**
 * shadcn/ui's Card (new-york v4), ported to Preact.
 *
 * @module
 */

import React from 'preact/compat';
import { cn } from '../../lib/utils';

/** A bordered surface: a `CardHeader`, a `CardContent` and a `CardFooter`. */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		data-slot="card"
		className={cn('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', className)}
		{...props}
	/>
));
Card.displayName = 'Card';

/** The card's header: a title and description, with a `CardAction` at the end when there is one. */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="card-header"
			className={cn(
				'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
				className,
			)}
			{...props}
		/>
	),
);
CardHeader.displayName = 'CardHeader';

/** The card's title. */
const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} data-slot="card-title" className={cn('font-semibold leading-none', className)} {...props} />
	),
);
CardTitle.displayName = 'CardTitle';

/** The line under the card's title, in muted text. */
const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} data-slot="card-description" className={cn('text-muted-foreground text-sm', className)} {...props} />
	),
);
CardDescription.displayName = 'CardDescription';

/** A control at the header's end, beside the title and description. */
const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="card-action"
			className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
			{...props}
		/>
	),
);
CardAction.displayName = 'CardAction';

/** The card's body. */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} data-slot="card-content" className={cn('px-6', className)} {...props} />
	),
);
CardContent.displayName = 'CardContent';

/** The card's footer row. */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			data-slot="card-footer"
			className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
			{...props}
		/>
	),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
