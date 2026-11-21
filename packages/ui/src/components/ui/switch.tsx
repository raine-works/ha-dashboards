import type React from 'preact/compat';
import { cn } from '../../lib/utils';

export interface SwitchProps {
	checked: boolean;
	onCheckedChange?: (checked: boolean) => void;
	disabled?: boolean;
	className?: string;
	'aria-label'?: string;
	/** Panel extension: a switch that only shows a state its row owns (hidden from screen readers and Tab). */
	'aria-hidden'?: boolean;
	tabIndex?: number;
}

/**
 * Panel design (not shadcn's pill): in the sliders' language, a 44×24 bar with the controls' radius
 * (`rounded-md`), muted when off and filled with the primary color when on (a light's own color in
 * its row), and a white grip block sliding to the end it's set to; a soft ring on keyboard focus.
 */
export const Switch: React.FC<SwitchProps> = ({
	checked,
	onCheckedChange,
	disabled = false,
	className,
	'aria-label': ariaLabel,
	'aria-hidden': ariaHidden,
	tabIndex,
}) => {
	const state = checked ? 'checked' : 'unchecked';

	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel}
			aria-hidden={ariaHidden}
			tabIndex={tabIndex}
			disabled={disabled}
			data-slot="switch"
			data-state={state}
			onClick={() => onCheckedChange?.(!checked)}
			className={cn(
				'peer group/switch relative inline-flex h-6 touch:h-8 touch:w-14 w-11 shrink-0 items-center rounded-md outline-none ring-primary/25 transition-[background-color,box-shadow] duration-150 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
				className,
			)}
		>
			{/* The grip: a white block like the slider's, sliding to the end the switch is set to */}
			<span
				data-slot="switch-thumb"
				data-state={state}
				className="pointer-events-none absolute top-1 left-1 block touch:size-6 h-4 w-4.5 rounded-sm bg-white shadow-sm ring-1 ring-black/15 transition-transform duration-150 data-[state=checked]:translate-x-4.5 touch:data-[state=checked]:translate-x-6"
			/>
		</button>
	);
};
