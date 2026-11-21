import { Check, House } from 'lucide-react';
import type React from 'preact/compat';
import { useColorScheme } from '../../context/ColorScheme';
import { useHassSelector } from '../../context/HassContext';
import { cn } from '../../lib/utils';
import { type CatalogTheme, setHomeAssistantTheme } from '../../themes/catalog';
import { themeStyle } from '../../themes/css';
import type { DashboardTheme } from '../../themes/tokens';
import { useThemeCatalog } from '../../themes/useThemeCatalog';
import { ColorSchemeToggle } from '../header/ColorSchemePicker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui';

/**
 * A dashboard in miniature, drawn in `theme`'s own colors: the page, a card with a line of text,
 * and a primary button (with the theme's gradient edge and glow, when it has them).
 */
export const ThemePreview: React.FC<{ theme: DashboardTheme; mode: 'light' | 'dark'; className?: string }> = ({
	theme,
	mode,
	className,
}) => {
	const effects = !!theme.effects?.gradient;
	return (
		<div
			style={themeStyle(theme, mode)}
			className={cn('flex flex-col gap-1.5 rounded-md border bg-background p-2 text-foreground', className)}
			aria-hidden="true"
		>
			<div className="flex flex-col gap-1.5 rounded-sm border bg-card p-2">
				<div className="h-1.5 w-3/5 rounded-full bg-foreground/80" />
				<div className="h-1.5 w-2/5 rounded-full bg-muted-foreground/60" />
				<div className="flex items-center gap-1.5 pt-1">
					<div
						className={cn('relative h-4 w-10 rounded-sm bg-primary', effects && 'theme-preview-edge')}
						data-glow={theme.effects?.glow ? '' : undefined}
					/>
					<div className="h-4 w-6 rounded-sm border bg-secondary" />
					<div className="ml-auto size-2 rounded-full bg-success" />
				</div>
			</div>
		</div>
	);
};

const Tile: React.FC<{
	label: string;
	hint?: string;
	selected: boolean;
	onSelect: () => void;
	children: React.ReactNode;
}> = ({ label, hint, selected, onSelect, children }) => (
	<button
		type="button"
		onClick={onSelect}
		aria-pressed={selected}
		className={cn(
			'flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-accent/50 touch:min-h-11',
			selected && 'border-primary ring-2 ring-primary/30',
		)}
	>
		{children}
		<span className="flex items-center gap-1.5 px-0.5 font-medium text-sm">
			<span className="truncate">{label}</span>
			{selected && <Check className="ml-auto size-4 shrink-0" />}
		</span>
		{hint && <span className="-mt-1.5 px-0.5 text-muted-foreground text-xs">{hint}</span>}
	</button>
);

/**
 * Appearance: Light, Dark or Auto, and the theme, a person's own (saved to their Home Assistant
 * profile, so it follows them to every device and styles all of Home Assistant), or the house's.
 */
export const AppearanceDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
	const { themes, house } = useThemeCatalog();
	const mode = useColorScheme();
	// What this person picked ('' or unset: the house theme)
	const picked = useHassSelector((hass) => hass?.selectedTheme?.theme ?? '', { watch: [] });
	const houseTheme = themes.find((t) => t.theme.id === house);
	const groups: [string, CatalogTheme[]][] = [
		['Themes', themes.filter((t) => !t.custom)],
		['House themes', themes.filter((t) => t.shared)],
		['Your themes', themes.filter((t) => t.mine)],
	];

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Appearance</DialogTitle>
					<DialogDescription>Your theme, for these dashboards and all of Home Assistant</DialogDescription>
				</DialogHeader>
				<ColorSchemeToggle />
				<div className="flex flex-col gap-4 overflow-y-auto">
					{houseTheme && (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
							<Tile
								label="House theme"
								hint={houseTheme.theme.name}
								selected={!picked}
								onSelect={() => setHomeAssistantTheme('')}
							>
								<div className="relative">
									<ThemePreview theme={houseTheme.theme} mode={mode} />
									<House className="absolute top-1.5 right-1.5 size-4 text-muted-foreground" />
								</div>
							</Tile>
						</div>
					)}
					{groups.map(
						([title, list]) =>
							list.length > 0 && (
								<section key={title} className="flex flex-col gap-2">
									<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
									<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
										{list.map((t) => (
											<Tile
												key={t.theme.id}
												label={t.theme.name}
												selected={picked === t.haName}
												onSelect={() => setHomeAssistantTheme(t.haName)}
											>
												<ThemePreview theme={t.theme} mode={mode} />
											</Tile>
										))}
									</div>
								</section>
							),
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
