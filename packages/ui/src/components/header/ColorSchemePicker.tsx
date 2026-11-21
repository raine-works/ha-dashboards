import { Moon, Sun, SunMoon } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { type ColorSchemeSetting, useHomeAssistantColorScheme } from '../../context/ColorScheme';
import { cn } from '../../lib/utils';
import { AppearanceDialog } from '../appearance/AppearanceDialog';
import { Button, type ButtonProps, ToggleGroup, ToggleGroupItem } from '../ui';

const CHOICES: { value: ColorSchemeSetting; label: string; icon: typeof Sun }[] = [
	{ value: 'light', label: 'Light', icon: Sun },
	{ value: 'dark', label: 'Dark', icon: Moon },
	{ value: 'auto', label: 'Auto', icon: SunMoon },
];

/**
 * Light, Dark or Auto: Home Assistant's own theme mode in this browser (Profile → Browser settings →
 * Theme), so its whole page and the Companion app change with it; Auto follows the device. The
 * wall panels pin dark whatever it says.
 */
export const ColorSchemeToggle: React.FC<{ className?: string }> = ({ className }) => {
	const [setting, setSetting] = useHomeAssistantColorScheme();
	return (
		<ToggleGroup
			variant="outline"
			value={setting}
			onValueChange={(value) => value && setSetting(value as ColorSchemeSetting)}
			aria-label="Appearance"
			className={cn('w-full', className)}
		>
			{CHOICES.map(({ value, label, icon: Icon }) => (
				<ToggleGroupItem key={value} value={value} aria-label={label}>
					<Icon />
					{label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
};

/** A header button showing Home Assistant's appearance (sun, moon, or both for Auto); opens Appearance. */
export const ColorSchemeButton: React.FC<{ size?: ButtonProps['size']; className?: string }> = ({
	size = 'icon-sm',
	className,
}) => {
	const [setting] = useHomeAssistantColorScheme();
	const [open, setOpen] = useState(false);
	const Icon = CHOICES.find((c) => c.value === setting)?.icon ?? SunMoon;
	return (
		<>
			<Button
				variant="outline"
				size={size}
				aria-label="Appearance"
				title="Appearance"
				className={className}
				onClick={() => setOpen(true)}
			>
				<Icon />
			</Button>
			<AppearanceDialog isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
};
