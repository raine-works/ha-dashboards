import { Check, House, Pencil, Plus } from 'lucide-react';
import type React from 'preact/compat';
import { lazy, Suspense, useState } from 'preact/compat';
import { useColorScheme } from '../../context/ColorScheme';
import { useHassSelector } from '../../context/HassContext';
import { cn } from '../../lib/utils';
import { type CatalogTheme, setHomeAssistantTheme } from '../../themes/catalog';
import { useThemeCatalog } from '../../themes/useThemeCatalog';
import { ColorSchemeToggle } from '../header/ColorSchemePicker';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui';
import { ThemePreview } from './ThemePreview';

// The editor loads the first time it's opened (a chunk of its own)
const ThemeEditor = lazy(() => import('./ThemeEditor'));

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
	const isAdmin = useHassSelector((hass) => !!hass?.user?.is_admin, { watch: [] });
	// The editor: closed, a new theme (null), or one of the person's own
	const [editing, setEditing] = useState<CatalogTheme | null | undefined>(undefined);
	const houseTheme = themes.find((t) => t.theme.id === house);
	const groups: [string, CatalogTheme[]][] = [
		['Themes', themes.filter((t) => !t.custom)],
		['House themes', themes.filter((t) => t.shared)],
		['Your themes', themes.filter((t) => t.mine)],
	];
	const canEdit = (t: CatalogTheme) => t.mine || (t.shared && isAdmin);

	return (
		<>
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
								(list.length > 0 || title === 'Your themes') && (
									<section key={title} className="flex flex-col gap-2">
										<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
										<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
											{list.map((t) => (
												<div key={t.theme.id} className="relative flex flex-col *:flex-1">
													<Tile
														label={t.theme.name}
														selected={picked === t.haName}
														onSelect={() => setHomeAssistantTheme(t.haName)}
													>
														<ThemePreview theme={t.theme} mode={mode} />
													</Tile>
													{canEdit(t) && (
														<Button
															variant="secondary"
															size="icon-sm"
															aria-label={`Edit ${t.theme.name}`}
															onClick={() => setEditing(t)}
															className="absolute top-3 right-3"
														>
															<Pencil />
														</Button>
													)}
												</div>
											))}
											{title === 'Your themes' && (
												<button
													type="button"
													onClick={() => setEditing(null)}
													className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-2 text-muted-foreground text-sm transition-colors hover:bg-accent/50 hover:text-foreground"
												>
													<Plus className="size-5" />
													New theme
												</button>
											)}
										</div>
									</section>
								),
						)}
					</div>
				</DialogContent>
			</Dialog>
			{editing !== undefined && (
				<Suspense fallback={null}>
					<ThemeEditor isOpen onClose={() => setEditing(undefined)} editing={editing ?? undefined} />
				</Suspense>
			)}
		</>
	);
};
