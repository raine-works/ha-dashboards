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
import { Card, Separator } from '../ui';
import {
	CamerasButton,
	DateSummary,
	MoreButton,
	NotificationsButton,
	OpenSensorsButton,
	PeopleStack,
	PetsStack,
	SidebarButton,
	TodoButton,
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
 * Header shared by every wall panel: clock, date (a greeting above it on the Home dashboard) (with the next calendar event; opens
 * the calendar), weather, open doors/windows, Home Assistant notifications (while there are any),
 * Assist (voice commands), to-do lists, cameras, music, a More menu (the daily brief, intercom, TVs and energy), people and pets. Below 1024px (10.5" panels) it tightens spacing and drops the
 * weather condition text so everything still fits on one row.
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
	// "N Open" takes the calendar hint's room while it shows (the open doors matter more)
	const anyOpen = useOpenCount() > 0;
	const divider = <Separator orientation="vertical" className="data-[orientation=vertical]:h-10" />;

	return (
		<Card
			data-panel-header=""
			className="flex-row items-center justify-between gap-3 px-6 py-4 max-xl:gap-2 max-xl:p-3"
		>
			{/* Left: Clock, Greeting & Date (calendar), Weather */}
			{/* Keeps its width: the music button is what gives way */}
			<div className="flex shrink-0 items-center gap-6 max-xl:gap-2.5">
				{sidebarButton && <SidebarButton className="-mx-3 max-xl:-mx-1" />}
				<div className="flex items-baseline gap-2">
					<span className="font-light text-5xl leading-none tracking-tight max-xl:text-4xl">{time}</span>
					<span className="font-medium text-muted-foreground text-sm">{ampm}</span>
				</div>

				{divider}

				{/* Tap for the calendar; the next event's hint takes the room left */}
				{/* Below xl (the 10.5" panels, windows under 1280px) the header has no room for the next event: tapping the date still opens the calendar */}
				{/* A holiday's character after the date, with room of its own */}
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
			</div>

			{/* Right: Open sensors, notifications and laundry (only while there are some), Cameras, Messages & Presence Avatars */}
			<div className="flex min-w-0 items-center gap-2 max-xl:gap-1.5">
				<OpenSensorsButton size="tile" />
				<ModuleGate id="notifications">
					<NotificationsButton size="tile" />
				</ModuleGate>
				{/* While a load runs, waits or is done */}
				<ModuleGate id="laundry">
					<LaundryButton size="tile" />
				</ModuleGate>
				{actions}
				<ModuleGate id="assist">
					<AssistButton size="tile" />
				</ModuleGate>
				{/* Each button a tile, the icon over what it opens */}
				<ModuleGate id="todo">
					<TodoButton size="tile" />
				</ModuleGate>
				<ModuleGate id="cameras">
					<CamerasButton size="tile" />
				</ModuleGate>
				{/* The one control that shrinks when the header is full: its text truncates down to the cover */}
				<ModuleGate id="music">
					<MusicButton size="tile" className="shrink overflow-hidden" />
				</ModuleGate>
				{/* The brief, intercom, TVs and energy, which don't all fit beside the rest */}
				<MoreButton tvRemote={tvRemote} colorSchemePicker={colorSchemePicker} />
				<ModuleGate id="people">
					<PeopleStack />
				</ModuleGate>
				<ModuleGate id="pets">
					<PetsStack before={divider} />
				</ModuleGate>
			</div>
		</Card>
	);
};

/** The header; a crash here leaves the rest of the panel working. */
export const PanelHeader = withErrorBoundary(PanelHeaderContent, 'The header', 'inline');
