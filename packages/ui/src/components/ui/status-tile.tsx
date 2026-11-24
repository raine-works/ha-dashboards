/**
 * Panel extension (docs/design/components.md): StatusTile, the house's state at a glance (the
 * alarm, the doors, the climate): an icon, a state word, one line of detail and at most one action.
 *
 * @module
 */

import type { ComponentChildren } from 'preact';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';
import { IconTile, type IconTone, SURFACE } from './tile';

/**
 * How a state reads: `ok` (secure, all closed), `attention` (something open, a delay running),
 * `danger` (the alarm going off, a fault), `neutral` (just a fact).
 */
export type StatusTone = 'ok' | 'attention' | 'danger' | 'neutral';

/** Each state's icon tone: success, warning, alarm, or the plain off tile. */
export const STATUS_ICON_TONES: Record<StatusTone, IconTone> = {
	ok: 'success',
	attention: 'warning',
	danger: 'alarm',
	neutral: 'off',
};

/**
 * Whether a state's action is the primary one in view. A good state's action is secondary
 * ("Armed · Disarm" is a quiet button); only a state that needs doing something leads with it
 * ("Disarmed · Arm"; the alarm going off).
 */
export const actionLeads = (tone: StatusTone) => tone === 'attention' || tone === 'danger';

/** A StatusTile's state and its one action. */
export interface StatusTileProps {
	icon: ComponentChildren;
	tone: StatusTone;
	/** The state in a word or two ("Armed Home", "All closed"). */
	state: string;
	/** One line of detail ("Perimeter armed", "Garage open 12 min"). */
	detail?: string;
	/**
	 * At most one action, a Button: `variant="secondary"` while the state is good, `default` when it
	 * needs action (`actionLeads()`).
	 */
	action?: ComponentChildren;
	/**
	 * What goes under the state, the tile's full width: a choice of actions that don't fit beside it
	 * (the alarm's Arm Home and Arm Away), a countdown, an error.
	 */
	children?: ComponentChildren;
	/** Layout only. */
	className?: string;
}

/**
 * A state at a glance: its icon tile in the state's tone, the state, a line of detail, and one
 * action at the end. Calm when all is well, so an exception stands out on its own; the color always
 * comes with the icon and the word.
 */
export const StatusTile: React.FC<StatusTileProps> = ({ icon, tone, state, detail, action, children, className }) => (
	<div
		data-slot="status-tile"
		data-tone={tone}
		className={cn(SURFACE, 'flex flex-col gap-3 p-4', tone === 'danger' && 'bg-alarm/10', className)}
	>
		<div className="flex items-center gap-3">
			<IconTile tone={STATUS_ICON_TONES[tone]}>{icon}</IconTile>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-title">{state}</span>
				{detail && <span className="truncate text-caption text-muted-foreground touch:text-sm">{detail}</span>}
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</div>
		{children}
	</div>
);
