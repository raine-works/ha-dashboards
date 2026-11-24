/**
 * Panel extension (docs/design/components.md): DeviceRow, the one way to draw a device in a section
 * or dialog: its icon tile, name and one status line, then one trailing control from a fixed set.
 *
 * @module
 */

import { ChevronRight } from 'lucide-react';
import type { ComponentChildren } from 'preact';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';
import { IconTile, type IconTone } from './tile';

/** A DeviceRow's content and its two ways in. */
export interface DeviceRowProps {
	/** Its icon, in an icon tile; left out where the trailing control needs the row's room (a setpoint stepper). */
	icon?: ComponentChildren;
	/** The icon tile's tone (`on`, a status), or a color of its own (a light's). */
	tone?: IconTone;
	iconStyle?: React.CSSProperties;
	name: string;
	/**
	 * One status line: the state in words ("Locked", "Heat · 70° inside"). A state is never a button's
	 * label; the button says what it does.
	 */
	status?: string;
	/** The status line in a status color (a door open, a fault), with its word: never color alone. */
	statusTone?: 'warning' | 'alarm';
	/**
	 * The one trailing control: a Switch, a stepper, or one labeled Button (Lock, Open). Without it,
	 * and with `onOpen`, a chevron says the row opens.
	 */
	trailing?: ComponentChildren;
	/** Opens the device's dialog (its dimmer, color, mode, position…): a tap on its name. */
	onOpen?: () => void;
	disabled?: boolean;
	/** Layout only. */
	className?: string;
}

/**
 * A device as one row: 48px tall, 56px on the wall panels. Its name and status open its dialog
 * (`onOpen`); its trailing control acts on it directly. Rows stack inside a `Section`, divided by
 * space or a hairline, never each in a card.
 */
export const DeviceRow: React.FC<DeviceRowProps> = ({
	icon,
	tone,
	iconStyle,
	name,
	status,
	statusTone,
	trailing,
	onOpen,
	disabled,
	className,
}) => {
	const text = (
		<>
			<span className="truncate font-medium text-body">{name}</span>
			{status && (
				<span
					className={cn(
						'truncate text-caption touch:text-sm',
						statusTone === 'warning' ? 'text-warning' : statusTone === 'alarm' ? 'text-alarm' : 'text-muted-foreground',
					)}
				>
					{status}
				</span>
			)}
		</>
	);
	return (
		<div
			data-slot="device-row"
			className={cn('flex min-h-12 touch:min-h-14 items-center gap-3', disabled && 'opacity-50', className)}
		>
			{icon && (
				<IconTile tone={tone} style={iconStyle}>
					{icon}
				</IconTile>
			)}
			{onOpen ? (
				<button
					type="button"
					onClick={onOpen}
					disabled={disabled}
					aria-label={[name, status, 'Open'].filter(Boolean).join(': ')}
					className="-mx-2 flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-control px-2 py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-accent/50"
				>
					{text}
				</button>
			) : (
				<span className="flex min-w-0 flex-1 flex-col">{text}</span>
			)}
			{trailing ? (
				<div className="flex shrink-0 items-center gap-1">{trailing}</div>
			) : (
				onOpen && <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
			)}
		</div>
	);
};
