/**
 * Panel extension: a button that takes two taps, for what can't be undone.
 *
 * @module
 */

import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { cn } from '../../lib/utils';
import { Button, type ButtonProps } from './button';
import { StableLabel } from './stable-label';

/** How long a confirm button stays armed after its first tap. */
export const CONFIRM_MS = 4000;

/** A button's props, but its look and content are the confirm button's own. */
export interface ConfirmButtonProps extends Omit<ButtonProps, 'variant' | 'onClick' | 'children'> {
	/** The icon before the label. */
	icon: React.ReactNode;
	/** "Clear queue" */
	label: string;
	/** What it says once armed: "Tap to clear" */
	confirmLabel: string;
	/** The second tap, within `CONFIRM_MS` of the first. */
	onConfirm: () => void;
	/** Classes on the label (e.g. hiding it where there's no room). */
	labelClassName?: string;
}

/**
 * Panel extension: a two-tap confirm for something that can't be undone (Clear queue, Dismiss all,
 * Clear completed). An outline button whose first tap arms it (it turns destructive and says
 * `confirmLabel`, without changing size) for `CONFIRM_MS`; a second tap then runs `onConfirm`.
 */
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
	icon,
	label,
	confirmLabel,
	onConfirm,
	labelClassName,
	...props
}) => {
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (!armed) return;
		const timer = setTimeout(() => setArmed(false), CONFIRM_MS);
		return () => clearTimeout(timer);
	}, [armed]);

	return (
		<Button
			variant={armed ? 'destructive' : 'outline'}
			onClick={() => {
				if (!armed) return setArmed(true);
				setArmed(false);
				onConfirm();
			}}
			{...props}
		>
			{icon}
			<StableLabel
				options={[label, confirmLabel]}
				value={armed ? 1 : 0}
				className={cn('justify-items-center', labelClassName)}
			/>
		</Button>
	);
};
