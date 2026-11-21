import { Minus, Plus, Thermometer, ThermometerSnowflake, ThermometerSun } from 'lucide-react';
import type React from 'preact/compat';
import { Fragment, useState } from 'preact/compat';
import { useEntity, useHassApi, useHassSelector } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { ModuleGate, useModule } from '../../context/Modules';
import { useOptimistic } from '../../hooks/useOptimistic';
import { discoverThermostats, stepSetpoint } from '../../lib/climate';
import { capitalize } from '../../lib/text';
import { cn } from '../../lib/utils';
import type { HassEntity } from '../../types/homeassistant';
import { CoversCard } from '../covers/CoverCard';
import { DiffusersCard } from '../diffuser/DiffuserCard';
import { FansCard } from '../fans/FanCard';
import { withErrorBoundary } from '../layout/ErrorBoundary';
import { SECTION_SCROLLER } from '../layout/scroll';
import {
	Badge,
	Button,
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	EmptyState,
	Separator,
	ToggleGroup,
	ToggleGroupItem,
} from '../ui';

const PRESET_ENTITY = 'input_select.thermostat_preset';
// The preset's state while the thermostats match no preset (set by hand): shown, never picked
export const OVERRIDE_PRESET = 'override';

const HVAC_MODES = [
	{ id: 'off', label: 'Off' },
	{ id: 'heat', label: 'Heat' },
	{ id: 'cool', label: 'Cool' },
	// Dual setpoint mode is "heat_cool" in Home Assistant
	{ id: 'heat_cool', label: 'Auto' },
];

/** The presets to pick from: the helper's options without Override. */
export const presetChoices = (options: string[] | undefined): string[] =>
	(options ?? ['home', 'away', 'sleep']).filter((option) => option !== OVERRIDE_PRESET);

export function formatTarget(entity: HassEntity): string {
	const { temperature, target_temp_low: low, target_temp_high: high } = entity.attributes;
	if (entity.state === 'off') return 'Off';
	if (entity.state === 'heat_cool' && low != null && high != null) return `${Math.round(low)}°–${Math.round(high)}°`;
	if (temperature != null) return `${Math.round(temperature)}°`;
	return '--';
}

export function formatStatus(entity: HassEntity): string {
	const { current_temperature: current, current_humidity: humidity, hvac_action: action } = entity.attributes;
	return [
		current != null ? `${Math.round(current)}° inside` : null,
		typeof humidity === 'number' ? `${Math.round(humidity)}%` : null,
		typeof action === 'string' && action !== 'off' ? capitalize(action) : null,
	]
		.filter(Boolean)
		.join(' · ');
}

/** What the stepper shows (single setpoint or range), to tell when a step has landed. */
const setpointKey = (entity: HassEntity | undefined) =>
	[entity?.attributes.temperature, entity?.attributes.target_temp_low, entity?.attributes.target_temp_high].join('/');

const ZoneControl: React.FC<{ entityId: string; name: string }> = ({ entityId, name }) => {
	const { callService, getHass, waitFor } = useHassApi();
	const entity = useEntity(entityId);
	const mode = useOptimistic(entity?.state ?? '');
	// Setpoint steps on their way: the setpoint pulses until the thermostat reports a new one
	const [adjusting, setAdjusting] = useState(0);
	if (!entity) return null;

	const isOff = mode.value === 'off';
	const adjust = async (step: number) => {
		const before = setpointKey(entity);
		setAdjusting((n) => n + 1);
		// The house's script (its thermostats' quirks: a deadband), else Home Assistant's own action
		if (getHass()?.services?.script?.adjust_thermostat_temperature)
			await callService('script', 'adjust_thermostat_temperature', { entity_id: entityId, step });
		else {
			const data = stepSetpoint(getHass()?.states[entityId], step);
			if (data) await callService('climate', 'set_temperature', { entity_id: entityId, ...data });
		}
		await waitFor((hass) => setpointKey(hass.states[entityId]) !== before);
		setAdjusting((n) => Math.max(0, n - 1));
	};

	return (
		<div className="flex flex-col gap-3 touch:max-lg:gap-2">
			{/* Status on its own line under the name and stepper, so neither truncates it */}
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
				<div className="truncate font-semibold">{name}</div>
				<div className="flex shrink-0 items-center gap-2 max-lg:gap-1">
					<Button
						variant="outline"
						size="icon-xl"
						className="max-lg:size-10 touch:max-lg:size-11"
						onClick={() => adjust(-1)}
						disabled={isOff}
						aria-label={`Decrease ${name} temperature`}
					>
						<Minus className="size-5" />
					</Button>
					<span
						className={cn(
							'min-w-24 whitespace-nowrap text-center font-semibold text-2xl tabular-nums max-lg:min-w-12 max-lg:text-base',
							adjusting > 0 && 'animate-pulse',
						)}
					>
						{formatTarget(entity)}
					</span>
					<Button
						variant="outline"
						size="icon-xl"
						className="max-lg:size-10 touch:max-lg:size-11"
						onClick={() => adjust(1)}
						disabled={isOff}
						aria-label={`Increase ${name} temperature`}
					>
						<Plus className="size-5" />
					</Button>
				</div>
				<div className="col-span-2 truncate text-muted-foreground text-sm">{formatStatus(entity)}</div>
			</div>

			<ToggleGroup
				variant="outline"
				size="lg"
				value={mode.value}
				onValueChange={(hvacMode) => {
					mode.set(hvacMode);
					callService('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: hvacMode });
				}}
				className="w-full"
			>
				{HVAC_MODES.map(({ id, label }) => (
					<ToggleGroupItem key={id} value={id}>
						{label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
};

/** House thermostats (preset + per-zone setpoint and mode), then every diffuser, every curtain and blind, and every fan. */
const ClimateSectionContent: React.FC = () => {
	const { callService } = useHassApi();
	const presetSelect = useEntity(PRESET_ENTITY);
	const preset = useOptimistic(presetSelect?.state ?? '');
	const presetOptions = presetChoices(presetSelect?.attributes?.options as string[] | undefined);
	// The house-wide preset needs its helper and automation (the thermostat_presets module)
	const presets = useModule('thermostat_presets');
	const thermostats = useModule('climate');
	const hasDiffusers = useModule('diffusers');
	const hasCovers = useModule('covers');
	const hasFans = useModule('fans');
	const overridden = presets && preset.value === OVERRIDE_PRESET;
	const { thermostats: configured } = useHouseConfig();
	const zones = useHassSelector((hass) => (hass ? discoverThermostats(hass, hass.states, configured) : []), {
		watch: ['climate'],
	});

	return (
		<section className="flex h-full min-h-0 flex-col gap-4 max-lg:gap-3">
			{/* Section Header */}
			<div className="flex items-center gap-3 px-2">
				<Thermometer className="size-6 shrink-0 text-sky-600 dark:text-sky-400" />
				<div>
					<h2 className="font-semibold text-lg leading-tight">Climate</h2>
					<p className="text-muted-foreground text-sm max-lg:hidden">Thermostats, scent, curtains and fans</p>
				</div>
			</div>

			{/* Scrolls under the section title when the cards don't fit (a short window, more curtains),
			    to the screen's bottom edge like the other columns */}
			<div className={cn('flex min-h-0 flex-1 flex-col gap-4 max-lg:gap-3', SECTION_SCROLLER)}>
				{/* Headed like the Curtains and Fans cards under it: an icon, the title and a line, over a border */}
				{thermostats && (
					<Card className="shrink-0 gap-0 py-0">
						<CardHeader className="items-center gap-3 border-b px-4 py-3 [.border-b]:pb-3">
							<div className="flex min-w-0 items-center gap-3">
								<ThermometerSun className="size-5 shrink-0 text-info" />
								<div className="min-w-0">
									<CardTitle className="truncate text-lg">Thermostats</CardTitle>
									<CardDescription className={cn('truncate', !overridden && 'touch:max-lg:hidden')}>
										{overridden
											? 'Set by hand; pick a preset to apply it'
											: presets
												? 'Presets apply to every zone'
												: 'Setpoint and mode'}
									</CardDescription>
								</div>
							</div>
							{overridden && (
								<CardAction className="self-center">
									<Badge variant="outline">Override</Badge>
								</CardAction>
							)}
						</CardHeader>

						<CardContent className="flex flex-col gap-5 p-4 max-lg:gap-4 touch:max-lg:gap-3">
							{/* House-wide preset, applied to every zone by automation.thermostat_sync_temperatures_to_preset_and_mode,
						    which also selects the preset the zones match when set by hand, else Override (none lit here) */}
							{presets && (
								<ToggleGroup
									variant="outline"
									size="xl"
									value={preset.value}
									onValueChange={(option) => {
										preset.set(option);
										callService('input_select', 'select_option', { entity_id: PRESET_ENTITY, option });
									}}
									className="w-full"
								>
									{presetOptions.map((option) => (
										<ToggleGroupItem key={option} value={option}>
											{capitalize(option)}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							)}

							{zones.map((zone) => (
								<Fragment key={zone.entityId}>
									{(presets || zone !== zones[0]) && <Separator />}
									<ZoneControl entityId={zone.entityId} name={zone.name} />
								</Fragment>
							))}
						</CardContent>
					</Card>
				)}

				{/* A new house: say what shows up here rather than leave the column blank */}
				{!(thermostats && zones.length) && !hasDiffusers && !hasCovers && !hasFans && (
					<EmptyState icon={<ThermometerSnowflake className="size-10" />}>
						Nothing here yet. Thermostats, curtains and blinds, fans and scent diffusers show up as Home Assistant finds
						them.
					</EmptyState>
				)}

				{/* Every EverScent diffuser (discovered; nothing without any): the oil left, the fragrance and Quick scent */}
				<ModuleGate id="diffusers">
					<DiffusersCard className="shrink-0" />
				</ModuleGate>

				{/* Every curtain and blind (discovered; nothing without any): they keep sun and cold out too */}
				<ModuleGate id="covers">
					<CoversCard className="shrink-0" />
				</ModuleGate>

				{/* Every fan (discovered; nothing without any) */}
				<ModuleGate id="fans">
					<FansCard className="shrink-0" />
				</ModuleGate>
			</div>
		</section>
	);
};

/** Climate; a crash here leaves the rest of the panel working. */
export const ClimateSection = withErrorBoundary(ClimateSectionContent, 'Climate');
