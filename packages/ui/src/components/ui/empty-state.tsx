import { RefreshCw } from 'lucide-react';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';
import { Button } from './button';

export interface EmptyStateProps {
	/** A `size-10` icon (or `HolidayPeek` with one as its fallback). */
	icon: React.ReactNode;
	children: React.ReactNode;
	/** A failure: an outline Try again under the text. */
	onRetry?: () => void;
	/** The retry is on its way (Button `loading`). */
	retrying?: boolean;
	className?: string;
}

/**
 * Panel extension: an empty or failed state, centered (Notifications' "You're all caught up", To-do's
 * "Nothing left", a list that couldn't load): an icon over a line of text, and for a failure an
 * outline Try again.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, children, onRetry, retrying, className }) => (
	<div className={cn('flex flex-col items-center gap-2 py-6 text-muted-foreground', className)}>
		{icon}
		<span className="text-center text-sm">{children}</span>
		{onRetry && (
			<Button variant="outline" onClick={onRetry} loading={retrying}>
				<RefreshCw />
				Try again
			</Button>
		)}
	</div>
);
