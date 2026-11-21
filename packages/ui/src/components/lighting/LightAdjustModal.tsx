import { Check, Flame, Palette, Sparkles, Sun } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { hsToRgb } from '../../lib/color';
import { type AdjustEffect, adjustCapabilities, byValue } from '../../lib/lights';
import {
	Button,
	ChipRow,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Slider,
} from '../ui';
import type { AdjustTarget } from './LightRow';
import { useLightingHass } from './useLightControls';

export interface LightAdjustModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** One fixture, or a room: every light in it that supports a setting gets it. */
	target: AdjustTarget | null;
}

const PRESET_COLORS: { name: string; rgb: [number, number, number]; hex: string }[] = [
	{ name: 'Warm white', rgb: [255, 214, 170], hex: '#ffd6aa' },
	{ name: 'Sunset amber', rgb: [255, 140, 0], hex: '#ff8c00' },
	{ name: 'Flame red', rgb: [239, 68, 68], hex: '#ef4444' },
	{ name: 'Neon pink', rgb: [236, 72, 153], hex: '#ec4899' },
	{ name: 'Violet', rgb: [168, 85, 247], hex: '#a855f7' },
	{ name: 'Ocean blue', rgb: [59, 130, 246], hex: '#3b82f6' },
	{ name: 'Cyan', rgb: [6, 182, 212], hex: '#06b6d4' },
	{ name: 'Emerald', rgb: [16, 185, 129], hex: '#10b981' },
	{ name: 'Lime', rgb: [132, 204, 22], hex: '#84cc16' },
];

const PRESET_TEMPS: { name: string; kelvin: number }[] = [
	{ name: 'Candle', kelvin: 2200 },
	{ name: 'Warm', kelvin: 2700 },
	{ name: 'Soft white', kelvin: 3500 },
	{ name: 'Neutral', kelvin: 4500 },
	{ name: 'Daylight', kelvin: 6000 },
];

export const LightAdjustModal: React.FC<LightAdjustModalProps> = ({ isOpen, onClose, target }) => {
	if (!target || !isOpen) return null;
	// Keyed so each target starts from its own state (and its hooks always run in order)
	return <LightAdjustDialog key={target.id} onClose={onClose} target={target} />;
};

/** "3 of 4 lights", when a setting reaches only some of a room's lights. */
const reach = (ids: string[], total: number) =>
	total > 1 && ids.length < total ? `${ids.length} of ${total} lights` : '';

const LightAdjustDialog: React.FC<{ onClose: () => void; target: AdjustTarget }> = ({ onClose, target }) => {
	const { callService } = useHassApi();
	const hass = useLightingHass();
	const room = target.lightIds.length > 1;
	const caps = adjustCapabilities(target.lightIds.map((id) => hass?.states[id]));
	const total = target.lightIds.length;

	// Color Temp
	const minKelvin = caps.temperature?.minKelvin ?? 2000;
	const maxKelvin = caps.temperature?.maxKelvin ?? 6500;
	const [kelvin, setKelvin] = useState<number>(caps.kelvin ?? 2700);

	// Rainbow Hue
	const [hue, setHue] = useState<number>(caps.hue ?? 32);

	// Optimistic local overrides, until the lights report them
	const [optimisticRgb, setOptimisticRgb] = useState<[number, number, number] | null>(null);
	const [optimisticEffect, setOptimisticEffect] = useState<string | null>(null);

	const activeRgb = optimisticRgb ?? caps.rgb;
	const activeEffect = optimisticEffect ?? caps.effect ?? 'off';

	// Follow the lights as they report
	useEffect(() => {
		if (caps.kelvin) setKelvin(caps.kelvin);
	}, [caps.kelvin]);
	useEffect(() => {
		if (caps.hue !== undefined) setHue(caps.hue);
		setOptimisticRgb(null);
	}, [caps.rgb?.join(','), caps.hue]);
	useEffect(() => {
		setOptimisticEffect(null);
	}, [caps.effect]);

	const handleColorTempCommit = (val: number) => {
		if (!caps.temperature) return;
		setKelvin(val);
		callService('light', 'turn_on', { entity_id: caps.temperature.ids, color_temp_kelvin: val });
	};

	const setColor = (rgb: [number, number, number]) => {
		if (!caps.color) return;
		setOptimisticRgb(rgb);
		callService('light', 'turn_on', { entity_id: caps.color.ids, rgb_color: rgb });
	};

	const handleHueCommit = (newHue: number) => {
		setHue(newHue);
		setColor(hsToRgb(newHue, 100));
	};

	// Each light gets the effect (or its own "no effect") by the name it lists it under
	const handleEffectToggle = (eff: AdjustEffect) => {
		const stop = activeEffect.toLowerCase() === eff.name.toLowerCase();
		setOptimisticEffect(stop ? 'off' : eff.name);
		const names = stop
			? Object.fromEntries(Object.keys(eff.lights).map((id) => [id, caps.effectOff[id] ?? 'off']))
			: eff.lights;
		for (const [effect, ids] of byValue(names)) callService('light', 'turn_on', { entity_id: ids, effect });
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{target.name}</DialogTitle>
					<DialogDescription>
						{room ? 'Sets every light in the room that supports it' : 'Color temperature, color and effects'}
					</DialogDescription>
				</DialogHeader>

				{/* SECTION 1: Color Temperature */}
				{caps.temperature && (
					<div className="flex flex-col gap-3 rounded-lg border p-4">
						<div className="flex items-center justify-between font-medium text-sm">
							<div className="flex items-center gap-2">
								<Sun className="size-4 text-muted-foreground" />
								Color temperature
							</div>
							<span className="font-mono text-muted-foreground">
								{[reach(caps.temperature.ids, total), `${kelvin}K`].filter(Boolean).join(' · ')}
							</span>
						</div>

						<Slider
							min={minKelvin}
							max={maxKelvin}
							step={25}
							value={kelvin}
							onValueChange={setKelvin}
							onValueCommit={handleColorTempCommit}
							trackClassName="bg-linear-to-r from-amber-500 via-orange-200 to-sky-300"
							rangeClassName="bg-transparent"
							aria-label="Color temperature"
						/>

						<ChipRow>
							{PRESET_TEMPS.map((t) => (
								<Button
									key={t.name}
									variant={Math.abs(kelvin - t.kelvin) < 150 ? 'default' : 'outline'}
									size="sm"
									onClick={() => handleColorTempCommit(t.kelvin)}
								>
									{t.name} ({t.kelvin}K)
								</Button>
							))}
						</ChipRow>
					</div>
				)}

				{/* SECTION 2: RGB Color Palette & Rainbow Hue */}
				{caps.color && (
					<div className="flex flex-col gap-3 rounded-lg border p-4">
						<div className="flex items-center justify-between font-medium text-sm">
							<div className="flex items-center gap-2">
								<Palette className="size-4 text-muted-foreground" />
								Color palette
							</div>
							<span className="text-muted-foreground text-xs">{reach(caps.color.ids, total)}</span>
						</div>

						{/* 44px swatches on the panels: nine fit the dialog with an 8px gap */}
						<div className="grid grid-cols-5 gap-2.5 touch:gap-2 sm:grid-cols-9">
							{PRESET_COLORS.map((c) => {
								const isSelected =
									!!activeRgb &&
									Math.abs(activeRgb[0] - c.rgb[0]) < 15 &&
									Math.abs(activeRgb[1] - c.rgb[1]) < 15 &&
									Math.abs(activeRgb[2] - c.rgb[2]) < 15;

								return (
									<button
										type="button"
										key={c.name}
										title={c.name}
										aria-label={c.name}
										aria-pressed={isSelected}
										onClick={() => setColor(c.rgb)}
										className="flex size-10 touch:size-11 cursor-pointer items-center justify-center rounded-full border ring-offset-2 ring-offset-background transition-shadow aria-pressed:ring-2 aria-pressed:ring-ring"
										style={{ backgroundColor: c.hex }}
									>
										{isSelected && <Check className="size-4 text-black" />}
									</button>
								);
							})}
						</div>

						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between text-muted-foreground text-xs">
								<span>Hue</span>
								<span className="font-mono">{hue}°</span>
							</div>
							<Slider
								min={0}
								max={360}
								step={1}
								value={hue}
								onValueChange={setHue}
								onValueCommit={handleHueCommit}
								// The hue spectrum: one gradient with every stop (a gradient takes one via- stop, so stacked
								// via- classes left only the last)
								trackClassName="bg-[linear-gradient(to_right,var(--color-red-500),var(--color-yellow-400),var(--color-green-500),var(--color-cyan-400),var(--color-blue-500),var(--color-purple-500),var(--color-red-500))]"
								rangeClassName="bg-transparent"
								aria-label="Hue"
							/>
						</div>
					</div>
				)}

				{/* SECTION 3: Preset Effects */}
				{caps.effects.length > 0 && (
					<div className="flex flex-col gap-3 rounded-lg border p-4">
						<div className="flex items-center justify-between font-medium text-sm">
							<div className="flex items-center gap-2">
								<Sparkles className="size-4 text-muted-foreground" />
								Effects
							</div>
							<span className="text-muted-foreground text-xs capitalize">
								{activeEffect !== 'off' ? activeEffect : 'None active'}
							</span>
						</div>

						<ChipRow>
							{caps.effects.map((eff) => {
								const name = eff.name.toLowerCase();
								const count = Object.keys(eff.lights).length;
								return (
									<Button
										key={name}
										variant={activeEffect.toLowerCase() === name ? 'default' : 'outline'}
										size="sm"
										onClick={() => handleEffectToggle(eff)}
										title={reach(Object.keys(eff.lights), total) || undefined}
										className="capitalize"
									>
										{(name === 'candle' || name === 'candlelight' || name === 'fire') && <Flame />}
										{eff.name}
										{/* A room's effect that only some of its lights have */}
										{room && count < total && <span className="text-xs opacity-70">{count}</span>}
									</Button>
								);
							})}
						</ChipRow>
					</div>
				)}

				<DialogFooter>
					<Button size="xl" onClick={onClose} className="w-full">
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
