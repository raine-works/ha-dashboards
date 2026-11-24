/**
 * Panel extension: a row that toggles its switch wherever it's tapped.
 *
 * @module
 */

import type React from 'preact/compat';
import { cn } from '../../lib/utils';
import { Switch, type SwitchProps } from './switch';

/** The switch's props, the row's content and its layout. */
export interface SwitchRowProps extends Omit<SwitchProps, 'className'> {
	/** The row's content (name, status); the switch sits after it. */
	children: React.ReactNode;
	/** Layout for the row (padding, borders). */
	className?: string;
}

/**
 * Panel extension: a row whose whole area toggles its switch (a `<label>` around the content and
 * the switch, so a tap anywhere flips it; tapping the switch itself toggles once). Pressed feedback
 * on touch, hover with a mouse. Keep other controls (sliders, buttons) outside the row.
 */
export const SwitchRow: React.FC<SwitchRowProps> = ({ children, className, ...switchProps }) => (
	// biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control (a role="switch" button) inside the label
	<label
		data-slot="switch-row"
		className={cn(
			'flex cursor-pointer select-none items-center gap-3 transition-colors hover:bg-accent/40 active:bg-accent/60 has-disabled:cursor-not-allowed has-disabled:opacity-60',
			className,
		)}
	>
		{children}
		<Switch {...switchProps} />
	</label>
);
