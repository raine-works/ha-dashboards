/**
 * The Daily dialog's card: a shared header over each tab's content.
 *
 * @module
 */

import type React from 'preact/compat';
import { cn } from '../../lib/utils';
import { Card, CardAction, CardHeader, CardTitle } from '../ui';

/**
 * A card of the Daily dialog: the cards' shared header (a colored icon, the title and a line under
 * them, with a detail at its right) over its content, which brings its own padding (divided rows
 * run edge to edge).
 */
export const BriefCard: React.FC<{
	/** A Lucide icon, or one of the panel's own (`Icons.tsx`). */
	icon: React.ComponentType<{ className?: string }>;
	/** The icon's color: both shades for a raw accent (`text-sky-600 dark:text-sky-400`). */
	tone: string;
	title: string;
	/** A short detail at the header's right ("2 events", the lesson's dates). */
	detail?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}> = ({ icon: Icon, tone, title, detail, className, children }) => (
	<Card className={cn('min-w-0 gap-0 py-0', className)}>
		{/* One row: the stock header keeps a second for a description */}
		<CardHeader className="grid-rows-1 items-center gap-3 border-b px-4 py-3 [.border-b]:pb-3">
			<div className="flex min-w-0 items-center gap-3">
				<Icon className={cn('size-5 shrink-0', tone)} />
				<CardTitle className="truncate text-lg">{title}</CardTitle>
			</div>
			{detail && (
				<CardAction className="row-span-1 self-center text-muted-foreground text-sm tabular-nums">{detail}</CardAction>
			)}
		</CardHeader>
		{children}
	</Card>
);
