import { CheckIcon, MinusIcon } from 'lucide-react';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';

export interface CheckboxProps {
	/** `indeterminate` (Radix's contract): some of what it stands for, e.g. a select-all box. */
	checked: boolean | 'indeterminate';
	onCheckedChange?: (checked: boolean) => void;
	disabled?: boolean;
	/** Panel extension: `xl` is a 28px box for touch. */
	size?: 'default' | 'xl';
	className?: string;
	'aria-label'?: string;
}

/** shadcn/ui (new-york v4) Checkbox without Radix: same markup, classes and `data-state`. */
export const Checkbox: React.FC<CheckboxProps> = ({
	checked,
	onCheckedChange,
	disabled = false,
	size = 'default',
	className,
	'aria-label': ariaLabel,
}) => {
	const state = checked === 'indeterminate' ? 'indeterminate' : checked ? 'checked' : 'unchecked';
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked === 'indeterminate' ? 'mixed' : checked}
			aria-label={ariaLabel}
			disabled={disabled}
			data-slot="checkbox"
			data-state={state}
			onClick={() => onCheckedChange?.(checked !== true)}
			className={cn(
				'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground dark:bg-input/30 dark:data-[state=checked]:bg-primary dark:data-[state=indeterminate]:bg-primary dark:aria-invalid:ring-destructive/40',
				size === 'xl' ? 'size-7 touch:size-9 rounded-md' : 'touch:size-6',
				className,
			)}
		>
			{checked && (
				<span data-slot="checkbox-indicator" className="flex items-center justify-center text-current transition-none">
					{checked === 'indeterminate' ? (
						<MinusIcon className={size === 'xl' ? 'size-5' : 'size-3.5'} />
					) : (
						<CheckIcon className={size === 'xl' ? 'size-5' : 'size-3.5'} />
					)}
				</span>
			)}
		</button>
	);
};
