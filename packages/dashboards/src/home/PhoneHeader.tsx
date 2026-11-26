/** The phone's header, shared by the Home dashboard (phones) and the Header card (when it's narrow). */

import { Button, ChipRow, Separator } from '@app/ui/components';
import {
	BirthdayEgg,
	ColorSchemeButton,
	DailyBriefButton,
	DateSummary,
	EnergyButton,
	Greeting,
	HEADER_TILE,
	HolidayEgg,
	LaundryButton,
	NotificationsButton,
	OpenSensorsButton,
	PeopleStack,
	PetsStack,
	PushSettingsButton,
	SidebarButton,
	TodoButton,
	WeatherSummary,
} from '@app/ui/header';
import { cn } from '@app/ui/lib/utils';
import { ModuleGate } from '@app/ui/modules';
import { TvButton } from '@app/ui/tv';
import { MessagesSquare } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';

/** What the phone header is told: where Messages opens, whether it sticks, and who hears its height. */
export interface PhoneHeaderProps {
	/** Messages' tile was tapped (its dialog is the caller's). */
	onIntercom: () => void;
	/** Stick to the top as the page scrolls (tablets in portrait). */
	sticky?: boolean;
	/** Its height, whenever it changes (for what sticks under it). */
	onHeight?: (px: number) => void;
	/** A button opening Home Assistant's sidebar (default: the Home dashboard hides HA's toolbar). */
	sidebarButton?: boolean;
}

/**
 * The phone's header: greeting and weather over the date and next event, who's home beside what the
 * house is doing now, and the dialogs' tiles (Daily, Messages, To-do, TV). The Home dashboard's on
 * phones, and the Header card's when it's narrow.
 */
export const PhoneHeader: React.FC<PhoneHeaderProps> = ({
	onIntercom,
	sticky = false,
	onHeight,
	sidebarButton = true,
}) => {
	// Big enough to tell who's who, with initials that fit
	const avatars = 'size-8 text-xs';
	// Its height, for what sticks under it (Lighting's tabs and floor names)
	const [el, setEl] = useState<HTMLElement | null>(null);
	useEffect(() => {
		if (!el || !onHeight) return;
		const observer = new ResizeObserver(() => onHeight(el.offsetHeight));
		observer.observe(el);
		return () => observer.disconnect();
	}, [el, onHeight]);
	return (
		<header
			ref={setEl}
			className={cn(
				'flex shrink-0 flex-col gap-3 border-b bg-background px-4 py-3',
				sticky && 'sticky top-(--panel-top) z-30',
			)}
		>
			{/* Home Assistant's toolbar is hidden, so its menu button is here: 48px, a thumb's size, beside
			    the greeting and weather over the date and the next event on one line (tap for the calendar) */}
			<div className="flex items-center gap-3">
				{sidebarButton && <SidebarButton />}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="flex items-center gap-3">
						{/* A holiday's or birthday's character beside the greeting, which truncates to make room */}
						<div className="flex min-w-0 flex-1 items-center gap-2.5">
							<Greeting className="min-w-0" />
							<ModuleGate id="holidays">
								<HolidayEgg className="size-6" />
								<BirthdayEgg className="size-6" />
							</ModuleGate>
						</div>
						<ModuleGate id="weather">
							<WeatherSummary showCondition={false} className="-my-1" />
						</ModuleGate>
					</div>
					<DateSummary quietDate hintBelow={false} />
				</div>
			</div>
			{/* Who's home, then what the house is doing now: a ChipRow at the right, icons but for the
			    readings (open doors, laundry's time left, the watts), so it fits without scrolling; it still
			    scrolls sideways on the narrowest phone; room past its box for the count badge */}
			<div className="flex items-center gap-3">
				<div className="flex shrink-0 items-center gap-1.5">
					<ModuleGate id="people">
						<PeopleStack avatarClassName={avatars} stackClassName="-space-x-0.5 max-lg:-space-x-0.5" />
					</ModuleGate>
					<ModuleGate id="pets">
						<PetsStack
							avatarClassName={avatars}
							stackClassName="-space-x-0.5 max-lg:-space-x-0.5"
							before={<Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />}
						/>
					</ModuleGate>
				</div>
				<ChipRow className="justify-end-safe -m-2 min-w-0 flex-1 p-2">
					<OpenSensorsButton size="sm" iconOnly />
					<ModuleGate id="notifications">
						<NotificationsButton size="icon-sm" />
					</ModuleGate>
					<ModuleGate id="laundry">
						<LaundryButton size="sm" />
					</ModuleGate>
					{/* The house's live draw (tap for energy) */}
					<ModuleGate id="energy">
						<EnergyButton size="sm" />
					</ModuleGate>
					{/* The signed-in member's phone alerts (nothing for anyone else) */}
					<PushSettingsButton />
					{/* This device's Light / Dark / Auto */}
					<ColorSchemeButton />
				</ChipRow>
			</div>
			{/* What opens a dialog, a labeled tile each, in alphabetical order, sharing the width (a missing
			    one leaves the rest wider) */}
			<div className="flex gap-2">
				<ModuleGate id="daily">
					<DailyBriefButton size="xl" tile className={HEADER_TILE} />
				</ModuleGate>
				<ModuleGate id="messages">
					<Button variant="secondary" size="xl" onClick={onIntercom} className={HEADER_TILE}>
						<MessagesSquare />
						<span>Messages</span>
					</Button>
				</ModuleGate>
				<ModuleGate id="todo">
					<TodoButton size="xl" tile className={HEADER_TILE} />
				</ModuleGate>
				<ModuleGate id="tvs">
					<TvButton size="xl" tile remote className={HEADER_TILE} />
				</ModuleGate>
			</div>
		</header>
	);
};
