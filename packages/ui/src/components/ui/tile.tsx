/**
 * Panel extensions (docs/design/components.md): the icon tile every row and tile leads with, and
 * the Tile, a square-ish squircle for something spatial or frequent (a room, a favorite).
 *
 * @module
 */

import type { ComponentChildren } from 'preact';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';

/**
 * What an icon tile shows: `off` (muted), `on` (the neutral "on": primary), or a status (its tint
 * and color). A light's own color isn't a tone: pass it as `style`.
 */
export type IconTone = 'off' | 'on' | 'success' | 'warning' | 'info' | 'alarm';

/**
 * A level-1 surface (docs/design/shape-space-type.md, depth): one fill step above the page, with a
 * hairline in light mode, where the card's fill is the page's own white, and none in dark, where its
 * lightness carries it.
 */
export const SURFACE = 'rounded-tile border border-border bg-card text-card-foreground dark:border-transparent';

/** Each tone's classes: theme tokens only, never raw palette colors (docs/design/color.md). */
export const ICON_TONES: Record<IconTone, string> = {
	off: 'bg-muted text-muted-foreground',
	on: 'bg-primary text-primary-foreground',
	success: 'bg-success/15 text-success',
	warning: 'bg-warning/15 text-warning',
	info: 'bg-info/15 text-info',
	alarm: 'bg-alarm/15 text-alarm',
};

/**
 * An icon in its squircle tile (44px, 48px on the wall panels; the icon half its size). `style` gives
 * it a color of its own (a light's: `background` and `color`), over the tone.
 */
export const IconTile: React.FC<{
	children: ComponentChildren;
	tone?: IconTone;
	style?: React.CSSProperties;
	/** Layout only. */
	className?: string;
}> = ({ children, tone = 'off', style, className }) => (
	<span
		data-slot="icon-tile"
		style={style}
		className={cn(
			'flex size-11 touch:size-12 shrink-0 items-center justify-center rounded-icon transition-colors [&_svg:not([class*=size-])]:size-5',
			!style && ICON_TONES[tone],
			className,
		)}
	>
		{children}
	</span>
);

/** A Tile's content and what tapping it does. */
export interface TileProps {
	/** The icon, drawn in the tile's icon tile. */
	icon: ComponentChildren;
	/** The icon tile's tone, or a color of its own (a room's lights). */
	tone?: IconTone;
	iconStyle?: React.CSSProperties;
	name: string;
	/** One status line ("2 on · Dinner", "Off"). */
	status?: string;
	/** Whether what it stands for is on (the status line reads stronger). */
	on?: boolean;
	/** The tile's one job: a tap anywhere on it. */
	onClick?: () => void;
	/** What a tap does, for screen readers ("Open the Kitchen"); else the name and status. */
	label?: string;
	disabled?: boolean;
	/** Layout only. */
	className?: string;
}

/**
 * A square-ish squircle: an icon tile, the name, one status line, and one tap target, the whole tile
 * (docs/design/components.md: a second control inside a tile splits the target). The tile stays a
 * neutral surface; "on" is its icon tile and status line. Lays out in a `TileGrid`.
 */
export const Tile: React.FC<TileProps> = ({
	icon,
	tone,
	iconStyle,
	name,
	status,
	on,
	onClick,
	label,
	disabled,
	className,
}) => (
	<button
		type="button"
		data-slot="tile"
		data-state={on ? 'on' : 'off'}
		onClick={onClick}
		disabled={disabled}
		aria-label={label ?? [name, status].filter(Boolean).join(': ')}
		className={cn(
			SURFACE,
			'flex min-h-28 touch:min-h-32 min-w-0 flex-col items-start justify-between gap-3 p-4 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100',
			className,
		)}
	>
		<IconTile tone={tone ?? (on ? 'on' : 'off')} style={iconStyle}>
			{icon}
		</IconTile>
		<span className="flex w-full min-w-0 flex-col gap-0.5">
			<span className="truncate font-semibold text-body">{name}</span>
			{status && (
				<span
					className={cn('truncate text-caption touch:text-sm', on ? 'text-foreground/80' : 'text-muted-foreground')}
				>
					{status}
				</span>
			)}
		</span>
	</button>
);

/**
 * Tiles in equal columns across the space they have (two in a wall panel's column or on a phone, three
 * on a wide one): no half-empty rows of fixed-width tiles.
 */
export const TileGrid: React.FC<{ children: ComponentChildren; className?: string }> = ({ children, className }) => (
	// Columns by the space it has (a container query): two in a wall panel's column or on a phone, three
	// from 36rem; every tile the same width on every floor, a lone one never stretching across
	<div className="@container">
		<div data-slot="tile-grid" className={cn('grid grid-cols-2 gap-3 @xl:grid-cols-3', className)}>
			{children}
		</div>
	</div>
);
