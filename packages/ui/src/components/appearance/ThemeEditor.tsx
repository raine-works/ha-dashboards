/**
 * The theme editor: builds a theme from choices, previews it on the real components, and saves it
 * with its Home Assistant theme. Loaded on demand (its default export is the lazy import's).
 *
 * @module
 */

import { ClipboardCopy, FileInput, Lightbulb, Lock, Trash2 } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useMemo, useState } from 'preact/compat';
import { useColorScheme } from '../../context/ColorScheme';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { cn } from '../../lib/utils';
import { BASE_GRAYS, type BaseGray, buildTheme, exportCss, importCss, type ThemeChoices } from '../../themes/build';
import { type CatalogTheme, reloadThemeCatalog, setHomeAssistantTheme } from '../../themes/catalog';
import { themeEffects, themeStyle } from '../../themes/css';
import { haTheme } from '../../themes/ha-theme';
import { raineworks } from '../../themes/presets/raineworks';
import type { DashboardTheme } from '../../themes/tokens';
import { useThemeCatalog } from '../../themes/useThemeCatalog';
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	ChipRow,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Slider,
	Switch,
	SwitchRow,
	Textarea,
	ToggleGroup,
	ToggleGroupItem,
	toast,
} from '../ui';

const LABEL = 'font-semibold text-muted-foreground text-xs uppercase tracking-wide';
const RADII = [0, 0.25, 0.375, 0.5, 0.625, 0.75, 1, 1.25];

type AccentKind = ThemeChoices['accent']['kind'];

/** A color picker: the system's swatch beside its hex. */
const ColorField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({
	label,
	value,
	onChange,
}) => (
	<label className="flex flex-1 items-center gap-2 rounded-md border px-2 py-1.5 touch:min-h-11">
		<input
			type="color"
			value={value}
			onInput={(e) => onChange((e.target as HTMLInputElement).value)}
			aria-label={label}
			className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
		/>
		<span className="flex flex-1 flex-col">
			<span className="text-sm">{label}</span>
			<span className="font-mono text-muted-foreground text-xs">{value}</span>
		</span>
	</label>
);

// The page's own theme's effects reach in (their selectors match any ancestor), so the effects
// this theme doesn't have are drawn in transparent (theme.css reads --edge-* and --glow-*)
function showcaseStyle(theme: DashboardTheme, mode: 'light' | 'dark'): Record<string, string> {
	const style = themeStyle(theme, mode);
	const effects = theme.effects?.gradient ? theme.effects : undefined;
	for (const [effect, on] of [
		['edge', effects?.edges],
		['glow', effects?.glow],
	] as const)
		if (!on) style[`--${effect}-from`] = style[`--${effect}-to`] = 'transparent';
	return style;
}

/**
 * The theme on the dashboards' own components (a header with its hairline, a room card, toggles,
 * buttons with their edges and glow, a switch, the statuses), in one mode. Inert: it only shows.
 */
const ThemeShowcase: React.FC<{ theme: DashboardTheme; mode: 'light' | 'dark'; className?: string }> = ({
	theme,
	mode,
	className,
}) => (
	<div
		inert
		aria-hidden="true"
		style={showcaseStyle(theme, mode)}
		data-effects={themeEffects(theme)}
		className={cn(mode, 'flex flex-col gap-3 rounded-lg border bg-background p-3 text-foreground', className)}
	>
		<Card data-panel-header="" className="relative flex-row items-center justify-between gap-2 px-4 py-3">
			<span className="font-medium text-lg tabular-nums">7:42</span>
			<Badge variant="success">Home</Badge>
		</Card>
		<Card className="gap-3 py-4">
			<CardHeader className="px-4">
				<CardTitle className="flex items-center gap-2">
					<Lightbulb className="size-4 text-muted-foreground" />
					Living Room
				</CardTitle>
				<CardDescription>2 of 3 on · Relaxed</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 px-4">
				<ToggleGroup variant="outline" value="heat" onValueChange={() => {}} className="w-full">
					<ToggleGroupItem value="off">Off</ToggleGroupItem>
					<ToggleGroupItem value="heat">Heat</ToggleGroupItem>
					<ToggleGroupItem value="cool">Cool</ToggleGroupItem>
				</ToggleGroup>
				<div className="flex items-center gap-2">
					<Button className="flex-1">Arm away</Button>
					<Button variant="outline" className="flex-1">
						<Lock />
						Lock
					</Button>
					<Switch checked />
				</div>
				<div className="flex flex-wrap gap-1.5">
					<Badge variant="success">Closed</Badge>
					<Badge variant="warning">Open</Badge>
					<Badge variant="info">Running</Badge>
					<Badge variant="destructive">Triggered</Badge>
				</div>
			</CardContent>
		</Card>
	</div>
);

/**
 * Make a theme, or change one of yours: start from any theme, keep its accent or give it a color or
 * a two-color gradient (edges and glow), pick the grays and the corners, and see it in light and
 * dark as you go. Saved to the integration, it's a Home Assistant theme like the others and becomes
 * yours at once. Import takes shadcn's CSS (ui.shadcn.com/themes, tweakcn); Copy CSS gives it back.
 */
export const ThemeEditor: React.FC<{ isOpen: boolean; onClose: () => void; editing?: CatalogTheme }> = ({
	isOpen,
	onClose,
	editing,
}) => {
	const { themes } = useThemeCatalog();
	const { getHass } = useHassApi();
	const isAdmin = useHassSelector((hass) => !!hass?.user?.is_admin, { watch: [] });
	const scheme = useColorScheme();
	const presets = themes.filter((t) => !t.custom);

	const [name, setName] = useState('');
	const [from, setFrom] = useState<DashboardTheme>(presets[0]?.theme ?? raineworks);
	const [base, setBase] = useState<BaseGray>('neutral');
	const [accentKind, setAccentKind] = useState<AccentKind>('keep');
	const [color, setColor] = useState('#2998ad');
	const [gradient, setGradient] = useState({ from: '#ea9a7e', to: '#2998ad' });
	const [radius, setRadius] = useState(0.625);
	const [edges, setEdges] = useState(true);
	const [glow, setGlow] = useState(true);
	const [shared, setShared] = useState(false);
	const [importing, setImporting] = useState(false);
	const [pasted, setPasted] = useState('');
	const [busy, setBusy] = useState(false);

	// Opened: a new theme from Raineworks, or the theme being changed as it is
	useEffect(() => {
		if (!isOpen) return;
		const start = editing?.theme ?? presets[0]?.theme ?? raineworks;
		setName(editing ? editing.theme.name : '');
		setFrom(start);
		setBase('neutral');
		setAccentKind('keep');
		setRadius(Number.parseFloat(start.radius) || 0.625);
		setEdges(start.effects?.edges ?? true);
		setGlow(start.effects?.glow ?? true);
		setShared(!!editing?.shared);
		setImporting(false);
		setPasted('');
	}, [isOpen, editing]);

	const theme = useMemo(
		() =>
			buildTheme(
				{
					name: name || 'My theme',
					from,
					base,
					accent:
						accentKind === 'color'
							? { kind: 'color', color }
							: accentKind === 'gradient'
								? { kind: 'gradient', ...gradient }
								: { kind: 'keep' },
					radius: `${radius}rem`,
					edges,
					glow,
				},
				editing?.theme.id,
			),
		[name, from, base, accentKind, color, gradient, radius, edges, glow, editing],
	);
	const hasGradient = !!theme.effects?.gradient;

	const importPasted = () => {
		const imported = importCss(pasted, from, name || 'Imported theme');
		if (!imported) {
			toast.error("That isn't a theme", { description: "Paste shadcn's CSS: a :root { … } block, and .dark { … }" });
			return;
		}
		setFrom(imported);
		setAccentKind('keep');
		setBase('neutral');
		setRadius(Number.parseFloat(imported.radius) || radius);
		if (!name) setName('Imported theme');
		setImporting(false);
		toast.success('Theme imported', { description: 'Name it and save it to use it' });
	};

	const copyCss = () =>
		navigator.clipboard
			?.writeText(exportCss(theme))
			.then(() => toast.success('CSS copied', { description: "shadcn's format: paste it into a project's CSS" }))
			.catch(() => toast.error("Couldn't copy"));

	const save = async () => {
		const hass = getHass();
		if (!hass?.callWS || !name.trim()) return;
		setBusy(true);
		try {
			const saved = await hass.callWS<{ ha_name: string }>({
				type: 'raineworks_dashboards/themes/save',
				theme,
				ha: haTheme(theme),
				shared,
			});
			await reloadThemeCatalog(hass);
			setHomeAssistantTheme(saved.ha_name);
			toast.success(`${name.trim()} saved`, { description: "It's your theme now" });
			onClose();
		} catch (err) {
			toast.error("Couldn't save the theme", { description: (err as Error).message });
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		const hass = getHass();
		if (!hass?.callWS || !editing) return;
		setBusy(true);
		try {
			await hass.callWS({ type: 'raineworks_dashboards/themes/delete', theme_id: editing.theme.id });
			await reloadThemeCatalog(hass);
			toast.success(`${editing.theme.name} deleted`);
			onClose();
		} catch (err) {
			toast.error("Couldn't delete the theme", { description: (err as Error).message });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>{editing ? `Edit ${editing.theme.name}` : 'New Theme'}</DialogTitle>
					<DialogDescription>For these dashboards and all of Home Assistant</DialogDescription>
				</DialogHeader>
				<div className="grid min-h-0 flex-1 grid-cols-1 gap-6 max-lg:overflow-y-auto lg:grid-cols-[minmax(0,26rem)_1fr]">
					<div className="flex min-h-0 flex-col gap-5 *:shrink-0 lg:overflow-y-auto lg:pr-1">
						<div className="flex flex-col gap-2">
							<label htmlFor="theme-name" className={LABEL}>
								Name
							</label>
							<Input
								id="theme-name"
								value={name}
								onInput={(e) => setName((e.target as HTMLInputElement).value)}
								placeholder="My theme"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<span className={LABEL}>Start from</span>
							<ChipRow>
								{presets.map((t) => (
									<Button
										key={t.theme.id}
										size="sm"
										variant={from.id === t.theme.id ? 'default' : 'outline'}
										onClick={() => setFrom(t.theme)}
									>
										{t.theme.name}
									</Button>
								))}
							</ChipRow>
						</div>

						<div className="flex flex-col gap-2">
							<span className={LABEL}>Accent</span>
							<ToggleGroup
								variant="outline"
								value={accentKind}
								onValueChange={(v) => v && setAccentKind(v as AccentKind)}
								className="w-full"
							>
								<ToggleGroupItem value="keep">The theme's</ToggleGroupItem>
								<ToggleGroupItem value="color">A color</ToggleGroupItem>
								<ToggleGroupItem value="gradient">A gradient</ToggleGroupItem>
							</ToggleGroup>
							{accentKind === 'color' && <ColorField label="Accent" value={color} onChange={setColor} />}
							{accentKind === 'gradient' && (
								<div className="flex gap-2">
									<ColorField
										label="From"
										value={gradient.from}
										onChange={(v) => setGradient((g) => ({ ...g, from: v }))}
									/>
									<ColorField label="To" value={gradient.to} onChange={(v) => setGradient((g) => ({ ...g, to: v }))} />
								</div>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<span className={LABEL}>Grays</span>
							<ToggleGroup
								variant="outline"
								value={base}
								onValueChange={(v) => v && setBase(v as BaseGray)}
								className="w-full"
							>
								{(Object.keys(BASE_GRAYS) as BaseGray[]).map((key) => (
									<ToggleGroupItem key={key} value={key}>
										{BASE_GRAYS[key].name}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>

						<div className="flex flex-col gap-2">
							<span className={cn(LABEL, 'flex justify-between')}>
								Corners <span className="normal-case tabular-nums tracking-normal">{radius}rem</span>
							</span>
							<Slider
								value={RADII.indexOf(radius) >= 0 ? RADII.indexOf(radius) : 4}
								min={0}
								max={RADII.length - 1}
								step={1}
								onValueChange={(i) => setRadius(RADII[i] ?? 0.625)}
							/>
						</div>

						{hasGradient && (
							<div className="flex flex-col gap-1">
								<span className={LABEL}>Effects</span>
								<SwitchRow checked={edges} onCheckedChange={setEdges} className="-mx-2 rounded-md px-2 py-2">
									<span className="flex flex-1 flex-col">
										<span className="text-sm">Gradient edges</span>
										<span className="text-muted-foreground text-xs">On buttons, and what's chosen or hovered</span>
									</span>
								</SwitchRow>
								<SwitchRow checked={glow} onCheckedChange={setGlow} className="-mx-2 rounded-md px-2 py-2">
									<span className="flex flex-1 flex-col">
										<span className="text-sm">Glow</span>
										<span className="text-muted-foreground text-xs">Under primary buttons</span>
									</span>
								</SwitchRow>
							</div>
						)}

						{isAdmin && (
							<SwitchRow checked={shared} onCheckedChange={setShared} className="-mx-2 rounded-md px-2 py-2">
								<span className="flex flex-1 flex-col">
									<span className="text-sm">Share with the house</span>
									<span className="text-muted-foreground text-xs">Everyone can pick it</span>
								</span>
							</SwitchRow>
						)}

						{importing && (
							<div className="flex flex-col gap-2">
								<span className={LABEL}>Import</span>
								<Textarea
									value={pasted}
									onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)}
									placeholder={':root {\n  --background: oklch(1 0 0);\n  …\n}\n.dark {\n  …\n}'}
									className="min-h-32 font-mono text-xs"
								/>
								<span className="text-muted-foreground text-xs">
									shadcn's CSS, from ui.shadcn.com/themes, tweakcn, or a project's globals.css
								</span>
								<Button variant="outline" onClick={importPasted} disabled={!pasted.trim()}>
									<FileInput />
									Import
								</Button>
							</div>
						)}
					</div>

					<div className="flex min-h-0 flex-col gap-3 max-lg:order-first">
						<span className={LABEL}>Preview</span>
						<div className="grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:overflow-y-auto">
							<ThemeShowcase theme={theme} mode="light" className={cn(scheme !== 'light' && 'max-sm:hidden')} />
							<ThemeShowcase theme={theme} mode="dark" className={cn(scheme !== 'dark' && 'max-sm:hidden')} />
						</div>
					</div>
				</div>
				<DialogFooter className="mt-auto">
					{editing && (editing.mine || isAdmin) && (
						<Button variant="outline" size="xl" onClick={remove} loading={busy} className="sm:mr-auto">
							<Trash2 />
							Delete
						</Button>
					)}
					<Button variant="outline" size="xl" onClick={copyCss}>
						<ClipboardCopy />
						Copy CSS
					</Button>
					<Button variant="outline" size="xl" onClick={() => setImporting((v) => !v)}>
						<FileInput />
						Import
					</Button>
					<Button size="xl" onClick={save} loading={busy} disabled={!name.trim()}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default ThemeEditor;
