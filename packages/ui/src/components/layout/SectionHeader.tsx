/**
 * The one header every section shares (Lighting, Security, Climate): a quiet icon, the title, and
 * the section's actions at the end. No subtitle: the title and what's under it say enough, and on
 * the wall panels every line of chrome is a line less for controls.
 *
 * @module
 */
import type { ComponentChildren } from 'preact';
import { cn } from '../../lib/utils';

/** A section's header: `icon` (a Lucide icon element), `title`, and `children` as its actions. */
export function SectionHeader({
	icon,
	title,
	children,
	className,
}: {
	/** The section's icon, drawn muted at 20px: color is kept for state (on, open, alarm). */
	icon: ComponentChildren;
	title: string;
	/** Buttons at the header's end (All off, Bedtime). */
	children?: ComponentChildren;
	/** Layout only. */
	className?: string;
}) {
	return (
		<div className={cn('flex min-h-11 items-center justify-between gap-3 px-1', className)}>
			<div className="flex min-w-0 items-center gap-2.5 text-muted-foreground [&_svg]:size-5 [&_svg]:shrink-0">
				{icon}
				<h2 className="truncate font-semibold text-foreground text-xl tracking-tight">{title}</h2>
			</div>
			{children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
		</div>
	);
}
