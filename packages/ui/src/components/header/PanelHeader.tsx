/**
 * The header every dashboard shares (clock, weather, alerts, the dialogs' buttons, people and pets),
 * and the building blocks it's made of, re-exported for the cards that lay out their own.
 *
 * @module
 */

import type React from 'preact/compat';
import { ModuleGate } from '../../context/Modules';
import { cn } from '../../lib/utils';
import { AssistButton } from '../assist/AssistOverlay';
import { BirthdayEgg, HolidayEgg } from '../holiday/HolidayEgg';
import { HolidayMuteButton } from '../holiday/HolidayMute';
import { LaundryButton } from '../laundry/LaundryButton';
import { withErrorBoundary } from '../layout/ErrorBoundary';
import { MusicButton, useMusicActive } from '../music/MusicDialog';
import { Separator, SURFACE } from '../ui';
import {
	CamerasButton,
	DateSummary,
	MoreButton,
	NotificationsButton,
	OpenSensorsButton,
	PeopleStack,
	PetsStack,
	SidebarButton,
	useClock,
	useOpenCount,
	WeatherSummary,
} from './HeaderControls';

export { AssistButton } from '../assist/AssistOverlay';
export { EnergyButton } from '../energy/EnergyDialog';
export { BirthdayEgg, HolidayEgg } from '../holiday/HolidayEgg';
export { LaundryButton } from '../laundry/LaundryButton';
export { PushSettingsButton } from '../notifications/PushSettings';
export { ColorSchemeButton, ColorSchemeToggle } from './ColorSchemePicker';
export * from './HeaderControls';

/** {@link PanelHeader}'s props. */
export interface PanelHeaderProps {
	/** Panel-specific buttons (and their dialogs), placed before Cameras. */
	actions?: React.ReactNode;
	/** The TV dialog's Remote tab (the Home dashboard; the wall panels leave it out). */
	tvRemote?: boolean;
	/** "Good evening, Alex" above the date (the Home dashboard; the wall panels leave it out). */
	greeting?: boolean;
	/** A button opening Home Assistant's sidebar, before the clock (the Home dashboard, which hides HA's toolbar). */
	sidebarButton?: boolean;
	/** This device's Light / Dark / Auto in the More menu (the Home dashboard; the wall panels stay dark). */
	colorSchemePicker?: boolean;
}

/**
 * The header every wall panel shares (and the Home dashboard's wide layout), in three zones
 * (docs/design/overhaul-plan.md): **status** on the left, the clock, the date (the next calendar
 * event; opens the calendar), the weather, and what needs someone while it does (doors open,
 * notices, laundry: chips that come and go); **who's home**, people and pets; and **at most three
 * quick actions**, Assist, Cameras and Music (after the panel's own, the kitchen's Timer), with
 * everything else (to-do, the brief, messages, TVs, energy) in More. Below xl it tightens; the music
 * button is the one control that shrinks.
 */
const PanelHeaderContent: React.FC<PanelHeaderProps> = ({
	actions,
	tvRemote,
	greeting,
	sidebarButton,
	colorSchemePicker,
}) => {
	const { time, ampm } = useClock();
	// The now-playing chip needs the room the weather condition takes
	const musicActive = useMusicActive();
	// "N open" takes the calendar hint's room while it shows (the open doors matter more)
	const anyOpen = useOpenCount() > 0;
	const divider = <Separator orientation="vertical" className="data-[orientation=vertical]:h-10" />;

	return (
		<header
			data-panel-header=""
			className={cn(
				SURFACE,
				'relative flex items-center justify-between gap-4 px-5 py-3 max-xl:gap-2 max-xl:px-3 max-xl:py-2',
			)}
		>
			{/* Status: the time, the date, the weather, then whatever needs someone (keeps its width) */}
			<div className="flex shrink-0 items-center gap-5 max-xl:gap-2.5">
				{sidebarButton && <SidebarButton className="-mx-2 max-xl:-mx-1" />}
				<div className="flex items-baseline gap-1.5">
					<span className="font-light text-5xl tabular-nums leading-none tracking-tight max-xl:text-4xl">{time}</span>
					<span className="font-medium text-muted-foreground text-sm">{ampm}</span>
				</div>

				{/* Tap for the calendar; the next event's hint takes the room left (none below xl, nor while
				    doors are open); a holiday's character after the date, with room of its own */}
				<div className="flex items-center gap-3 max-xl:gap-2">
					<DateSummary
						greeting={greeting}
						className={cn(
							'max-w-52 max-xl:*:data-[slot=calendar-hint]:hidden',
							anyOpen && '*:data-[slot=calendar-hint]:hidden',
						)}
					/>
					<ModuleGate id="holidays">
						<HolidayEgg className="size-6 max-xl:size-5" />
						<BirthdayEgg className="size-6 max-xl:size-5" />
						{/* Its sounds muted for an hour, house-wide (wall panels, in a holiday's days) */}
						<HolidayMuteButton className="-ml-1" />
					</ModuleGate>
				</div>

				<ModuleGate id="weather">
					<WeatherSummary before={divider} showCondition={!musicActive} />
				</ModuleGate>

				{/* What needs someone, only while it does: compact chips, so they read as status, not actions */}
				<div className="flex items-center gap-2 empty:hidden max-xl:gap-1.5">
					<OpenSensorsButton size="md" />
					<ModuleGate id="notifications">
						<NotificationsButton size="icon-md" />
					</ModuleGate>
					{/* While a load runs, waits or is done */}
					<ModuleGate id="laundry">
						<LaundryButton size="md" />
					</ModuleGate>
				</div>
			</div>

			<div className="flex min-w-0 items-center gap-3 max-xl:gap-1.5">
				{/* Who's home */}
				<ModuleGate id="people">
					<PeopleStack />
				</ModuleGate>
				<ModuleGate id="pets">
					<PetsStack before={divider} />
				</ModuleGate>

				{/* The quick actions: the panel's own, then Assist, Cameras and Music; the rest in More */}
				<div className="flex min-w-0 items-center gap-2 max-xl:gap-1.5">
					{actions}
					<ModuleGate id="assist">
						<AssistButton size="tile" />
					</ModuleGate>
					<ModuleGate id="cameras">
						<CamerasButton size="tile" />
					</ModuleGate>
					{/* The one control that shrinks when the header is full: its text truncates down to the cover */}
					<ModuleGate id="music">
						<MusicButton size="tile" className="shrink overflow-hidden" />
					</ModuleGate>
					<MoreButton tvRemote={tvRemote} colorSchemePicker={colorSchemePicker} />
				</div>
			</div>
		</header>
	);
};

/** The header; a crash here leaves the rest of the panel working. */
export const PanelHeader = withErrorBoundary(PanelHeaderContent, 'The header', 'inline');
