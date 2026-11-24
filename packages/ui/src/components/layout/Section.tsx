/**
 * A screen's group (Lighting, Security, Climate): the one `SectionHeader`, then its content
 * (docs/design/components.md). No second header inside: a group within it gets a `SectionGroup`
 * overline ("Doors", "Main floor"), and its devices are `DeviceRow`s on one surface, never cards in
 * a card.
 *
 * @module
 */

import type { ComponentChildren } from 'preact';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';
import { SURFACE } from '../ui/tile';
import { SectionHeader } from './SectionHeader';

/** A section: its header (icon, title, actions) and its content. */
export const Section: React.FC<{
	icon: ComponentChildren;
	title: string;
	/** Buttons at the header's end (All off, Bedtime). */
	actions?: ComponentChildren;
	children: ComponentChildren;
	/** Layout only. */
	className?: string;
}> = ({ icon, title, actions, children, className }) => (
	<section className={cn('flex min-h-0 min-w-0 flex-col gap-gap', className)}>
		<SectionHeader icon={icon} title={title}>
			{actions}
		</SectionHeader>
		{children}
	</section>
);

/**
 * A group in a section: an overline label over its content. `surface` puts its rows on one card
 * surface (rows inside divided by a hairline), the way devices are listed; tiles go without it.
 */
export const SectionGroup: React.FC<{
	label?: string;
	/** Buttons at the label's end, for the whole group (Open all / Close all). */
	actions?: ComponentChildren;
	surface?: boolean;
	children: ComponentChildren;
	/** Layout only. */
	className?: string;
}> = ({ label, actions, surface, children, className }) => (
	<div className={cn('flex min-w-0 flex-col gap-2', className)}>
		{(label || actions) && (
			<div className="flex min-h-8 items-center justify-between gap-2 px-1">
				{label && <h3 className="truncate text-muted-foreground text-overline uppercase">{label}</h3>}
				{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
			</div>
		)}
		{surface ? <div className={cn(SURFACE, 'flex flex-col divide-y px-4 *:py-2')}>{children}</div> : children}
	</div>
);
