/**
 * Panel extension (docs/design/components.md): CheckRow, one of several things to pick (speakers
 * to announce on, people to message): the whole row is the target, a check at its end. Rows stack
 * on one surface (`SectionGroup surface`), never each in a box; picking many is a check, never a
 * radio circle.
 *
 * @module
 */

import { Check } from 'lucide-react';
import type { ComponentChildren } from 'preact';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';

/** A CheckRow's content and whether it's picked. */
export interface CheckRowProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	/** What it is ("Kitchen"). */
	label: string;
	/** A small icon or avatar before the label. */
	icon?: ComponentChildren;
	/** A word after the label, muted ("Off", "Playing the TV"). */
	detail?: string;
	disabled?: boolean;
	/** Layout only. */
	className?: string;
}

/** The check at a row's end: an empty ring, filled with a check while picked. */
export const checkMarkClasses = (checked: boolean) =>
	cn(
		'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
		checked ? 'bg-primary text-primary-foreground' : 'ring-2 ring-muted-foreground/40 ring-inset',
	);

/** One thing to pick among several: its name and a check, the whole row a target (48px, 56 on the panels). */
export const CheckRow: React.FC<CheckRowProps> = ({
	checked,
	onCheckedChange,
	label,
	icon,
	detail,
	disabled,
	className,
}) => (
	<button
		type="button"
		role="checkbox"
		aria-checked={checked}
		data-slot="check-row"
		data-state={checked ? 'checked' : 'unchecked'}
		disabled={disabled}
		onClick={() => onCheckedChange(!checked)}
		className={cn(
			'-mx-2 flex min-h-12 touch:min-h-14 w-[calc(100%+1rem)] shrink-0 items-center gap-3 rounded-control px-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-accent/50 disabled:opacity-50 [&_svg:not([class*=size-])]:size-5',
			className,
		)}
	>
		{icon && <span className="flex shrink-0 items-center text-muted-foreground">{icon}</span>}
		<span className="min-w-0 flex-1 truncate font-medium text-body">{label}</span>
		{detail && <span className="shrink-0 text-caption text-muted-foreground">{detail}</span>}
		<span aria-hidden className={checkMarkClasses(checked)}>
			{checked && <Check className="size-4" strokeWidth={3} />}
		</span>
	</button>
);
