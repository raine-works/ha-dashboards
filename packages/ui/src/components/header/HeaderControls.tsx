import {
	AlertTriangle,
	Bell,
	CalendarDays,
	Cctv,
	LayoutGrid,
	ListTodo,
	MessagesSquare,
	Newspaper,
	PanelLeft,
	Tv as TvIcon,
	Wifi,
	Zap,
} from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState, useSyncExternalStore } from 'preact/compat';
import { useEntity, useHassApi, useHassSelector } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { useModule } from '../../context/Modules';
import { useWallPanel } from '../../context/WallPanel';
import { useLinkedParams } from '../../hooks/useLinkedParams';
import { discoverOpenings, openingsWatch } from '../../lib/alerts';
import { formatEventWhen } from '../../lib/calendar';
import { discoverPeople, householdFirstName, PEOPLE_WATCH } from '../../lib/people';
import {
	discoverFeeders,
	discoverLitterBoxes,
	discoverPets,
	PET_CARE_WATCH,
	petCareNeedsAttention,
} from '../../lib/pets';
import { todoBadgeCount } from '../../lib/todo';
import { cn } from '../../lib/utils';
import { formatWeatherCondition } from '../../lib/weather';
import { openSidebar } from '../../panel/chrome';
import { showOpenSensors } from '../alerts/OpenSensorsDialog';
import { DailyBriefDialog, type DailyBriefTab } from '../brief/DailyBriefDialog';
import { CalendarDialog } from '../calendar/CalendarDialog';
import { useNextCalendarEvent } from '../calendar/useCalendar';
import { CameraModal } from '../camera';
import { useCameraActivity } from '../camera/useCameraDetections';
import { EnergyDialog, HouseWatts } from '../energy/EnergyDialog';
import { useEnergyModel } from '../energy/useEnergy';
import { IntercomDialog } from '../intercom/IntercomDialog';
import { NotificationsDialog, useNotifications } from '../notifications/NotificationsDialog';
import { PeopleDialog } from '../people/PeopleDialog';
import { PetsDialog } from '../pets/PetsDialog';
import { TodoDialog } from '../todo/TodoDialog';
import { useMyTodoCounts, useTodoLists } from '../todo/useTodo';
import { TvDialog, useTvs } from '../tv/TvDialog';
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	type ButtonProps,
	CountBadge,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '../ui';
import { WeatherDialog } from '../weather/WeatherDialog';
import { WeatherIcon } from '../weather/WeatherIcon';
import { GuestWifiDialog, useGuestWifi } from '../wifi/GuestWifiDialog';
import { ColorSchemeToggle } from './ColorSchemePicker';

// Header building blocks shared by the wall panels and the home dashboard. Each button owns its dialog.

export interface Clock {
	/** "7:05" */
	time: string;
	ampm: string;
	/** "Sat, Oct 18" */
	date: string;
	greeting: string;
}

function readClock(now = new Date()): Clock {
	const h = now.getHours();
	return {
		time: `${h % 12 || 12}:${now.getMinutes().toString().padStart(2, '0')}`,
		ampm: h >= 12 ? 'PM' : 'AM',
		date: now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
		greeting: h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening',
	};
}

// One clock for the whole page (the header, the date, the greeting), ticking on the minute: it shows
// minutes, and every tick re-renders the header, whose selectors scan all of Home Assistant's states
let clock = readClock();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setTimeout> | undefined;

function tickClock() {
	const next = readClock();
	if (
		next.time !== clock.time ||
		next.ampm !== clock.ampm ||
		next.date !== clock.date ||
		next.greeting !== clock.greeting
	) {
		clock = next;
		for (const listener of clockListeners) listener();
	}
	// Just past the next minute (a timer that fires late, e.g. after the page slept, catches up here)
	const now = new Date();
	clockTimer = setTimeout(tickClock, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
}

function subscribeClock(listener: () => void) {
	clockListeners.add(listener);
	if (clockListeners.size === 1) tickClock();
	return () => {
		clockListeners.delete(listener);
		if (clockListeners.size === 0) clearTimeout(clockTimer);
	};
}

/** Time, date and greeting: one shared clock, a new value only when the minute (or day) changes. */
export function useClock(): Clock {
	return useSyncExternalStore(subscribeClock, () => clock);
}

/** "Good evening, Alex": the time of day's greeting, with the signed-in household member's first name. */
function useGreeting(): string {
	const { greeting } = useClock();
	const firstName = useHassSelector((hass) => (hass ? householdFirstName(hass.states, hass.user?.id) : undefined), {
		watch: (id) => id.startsWith('person.'),
	});
	return firstName ? `${greeting}, ${firstName}` : greeting;
}

/** The greeting on a line of its own (the phone header, beside the weather). */
export const Greeting: React.FC<{ className?: string }> = ({ className }) => (
	<p className={cn('truncate font-semibold', className)}>{useGreeting()}</p>
);

/**
 * Date with a hint of the next calendar event ("Soccer · Tomorrow 5:30 PM"); tap for the calendar.
 * `greeting` (the Home dashboard) puts "Good evening, Alex" above it; without it (the wall panels)
 * the date leads and the hint sits under it, and `quietDate` keeps the date muted (at the text's
 * full size), under a greeting shown on its own (the phone header). The hint truncates to the room left, or
 * sits on its own line with `hintBelow` (the default without the greeting; `hintBelow={false}`
 * keeps it beside the date, as on the phone header).
 */
export const DateSummary: React.FC<{
	greeting?: boolean;
	quietDate?: boolean;
	hintBelow?: boolean;
	className?: string;
}> = ({ greeting: showGreeting = false, quietDate = false, hintBelow: hintBelowProp, className }) => {
	const { date } = useClock();
	const greeting = useGreeting();
	// Without the greeting the date is the first line, so the hint gets the second
	const hintBelow = hintBelowProp ?? !showGreeting;
	const [open, setOpen] = useState(false);
	const next = useNextCalendarEvent(new Date());
	// One line that truncates at its end ("Work · Tomorrow 5:0…"), so the event's name always shows
	// before its time, and never more than the room it has
	const hint = next && (
		<span className="flex min-w-0 items-center gap-1.5">
			<CalendarDays className={cn('shrink-0', quietDate ? 'size-4' : 'size-3.5')} />
			<span className="min-w-0 truncate">
				<span className="text-foreground">{next.summary}</span> · {formatEventWhen(next)}
			</span>
		</span>
	);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={`Calendar${next ? `, next: ${next.summary} ${formatEventWhen(next)}` : ''}`}
				className={cn(
					// Clipped to its own box, so a long hint never draws past it, whatever the browser makes of
					// the flex sizing (the wall panels' WebView let it run over the weather)
					'-mx-2 -my-1 touch:-my-2 flex touch:min-h-12 min-w-0 flex-col touch:justify-center overflow-hidden rounded-md px-2 py-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
					className,
				)}
			>
				{showGreeting && <span className="truncate font-semibold">{greeting}</span>}
				<span
					className={cn(
						// Clipped to the button, so a long hint never draws past it
						'flex min-w-0 items-center gap-1.5 overflow-hidden',
						// Muted under a greeting; at the text's full size on the phone header, where it's the line to read
						showGreeting ? 'text-muted-foreground text-sm' : quietDate ? 'text-muted-foreground' : 'font-semibold',
					)}
				>
					<span className="shrink-0 whitespace-nowrap">{date}</span>
					{!hintBelow && hint && (
						<>
							<span aria-hidden className="shrink-0">
								·
							</span>
							{hint}
						</>
					)}
				</span>
				{hintBelow && hint && (
					<span data-slot="calendar-hint" className="flex w-full min-w-0 overflow-hidden text-muted-foreground text-sm">
						{hint}
					</span>
				)}
			</button>
			<CalendarDialog isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
};

/**
 * Outside temperature with the condition's icon (night-aware via `sun.sun`); the condition text
 * hides below xl (or always, with `showCondition={false}`). Tap for the weather dialog. Nothing
 * without a weather entity; `before` shows only with it.
 */
export const WeatherSummary: React.FC<{ showCondition?: boolean; className?: string; before?: React.ReactNode }> = ({
	showCondition = true,
	className,
	before,
}) => {
	const [open, setOpen] = useState(false);
	const sun = useEntity('sun.sun');
	const { weather: configured } = useHouseConfig();
	const weather = useHassSelector(
		(hass) =>
			(configured && hass?.states[configured]) ||
			Object.values(hass?.states ?? {}).find((s) => s.entity_id.startsWith('weather.')),
		{ watch: ['weather'], isEqual: Object.is },
	);
	const temp = weather?.attributes?.temperature;
	const condition = weather?.state || 'clear';
	if (!weather || temp == null) return null;

	return (
		<>
			{before}
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={`Weather: ${Math.round(temp)}°, ${formatWeatherCondition(condition)}`}
				className={cn(
					'-mx-2 -my-1 touch:-my-2 flex touch:min-h-12 shrink-0 items-center gap-2 rounded-md px-2 py-1 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
					className,
				)}
			>
				<WeatherIcon condition={condition} night={sun?.state === 'below_horizon'} className="size-5" />
				{/* Room for three digits, so the temperature changing never shifts the header */}
				<span className="min-w-[3.5ch] font-semibold tabular-nums">{Math.round(temp)}°</span>
				{showCondition && (
					<span className="whitespace-nowrap text-muted-foreground text-sm max-xl:hidden">
						{formatWeatherCondition(condition)}
					</span>
				)}
			</button>
			<WeatherDialog isOpen={open} onClose={() => setOpen(false)} entityId={weather.entity_id} />
		</>
	);
};

type HeaderButtonProps = { size?: ButtonProps['size']; className?: string };

/**
 * A launcher as a tile (the phone header's row): the label always shows, under the icon with the
 * caller's layout (`HEADER_TILE`).
 */
type TileProps = { label?: boolean; tile?: boolean };

/** A header tile's layout: the icon over its label, sharing the row's width. */
export const HEADER_TILE =
	"h-14 min-w-0 flex-1 flex-col gap-1 px-2 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-5";

/**
 * Opens Home Assistant's sidebar (as a drawer), for a dashboard that hides HA's toolbar and its
 * menu button with it (`hideChrome` on `definePanelElement`).
 */
export const SidebarButton: React.FC<HeaderButtonProps> = ({ size = 'icon-xl', className }) => (
	<Button
		variant="outline"
		size={size}
		onClick={(e) => openSidebar(e.currentTarget as Element)}
		aria-label="Open the sidebar"
		title="Open the sidebar"
		className={cn('shrink-0', className)}
	>
		<PanelLeft className="size-5" />
	</Button>
);

/** How many doors, windows and garage doors are open (discovered by device class). */
export function useOpenCount(): number {
	const { getHass } = useHassApi();
	return useHassSelector((hass) => (hass ? discoverOpenings(hass.states).filter((o) => o.isOpen).length : 0), {
		watch: openingsWatch(() => getHass()?.states),
	});
}

/** Amber "N Open" while any door, window or garage is open (nothing otherwise); lists them. */
export const OpenSensorsButton: React.FC<HeaderButtonProps & { iconOnly?: boolean }> = ({
	size = 'xl',
	iconOnly,
	className,
}) => {
	const count = useOpenCount();
	// The dialog is the page's one (PanelAlerts renders it), so it stays open when the last door closes
	if (count === 0) return null;

	return (
		<Button
			variant="warning"
			size={size}
			onClick={showOpenSensors}
			aria-label={`${count} open`}
			title={`${count} open`}
			className={className}
		>
			<AlertTriangle />
			{/* One flex item (separate "{n}" and " Open" nodes would be two); the word goes below xl so
					    it takes little of the header's room when it appears */}
			<span className="tabular-nums">
				{count}
				{!iconOnly && <span className="max-xl:hidden"> Open</span>}
			</span>
		</Button>
	);
};

/**
 * Home Assistant's notifications (persistent notifications) with a count; opens them to dismiss
 * one by one or all at once. Shows only while there are some, like the Open button.
 */
export const NotificationsButton: React.FC<HeaderButtonProps> = ({ size = 'icon-xl', className }) => {
	const [open, setOpen] = useState(false);
	const notifications = useNotifications();
	const count = notifications.notifications.length;
	if (count === 0 && !open) return null;
	const title = `${count} notification${count === 1 ? '' : 's'}`;

	return (
		<>
			{count > 0 && (
				<Button
					variant="outline"
					size={size}
					onClick={() => setOpen(true)}
					aria-label={title}
					title={title}
					className={cn('relative', className)}
				>
					<Bell />
					<CountBadge>{count}</CountBadge>
				</Button>
			)}
			<NotificationsDialog isOpen={open} onClose={() => setOpen(false)} {...notifications} />
		</>
	);
};

/**
 * Opens the to-do lists, with a count of what's left across them (shopping lists aside; with a
 * household member signed in, only what's theirs or anyone's). `label` adds "To-do" (hidden on
 * the narrowest phones). Nothing without a `todo.*` list.
 */
export const TodoButton: React.FC<HeaderButtonProps & TileProps> = ({ size = 'icon-xl', label, tile, className }) => {
	const [open, setOpen] = useState(false);
	// A to-do notification's link (`?todo=<list>&item=<uid>`) opens the list with the item in view
	const [link, clearLink] = useLinkedParams(['todo', 'item']);
	useEffect(() => {
		if (link) setOpen(true);
	}, [link]);
	const lists = useTodoLists();
	// A household member's own and anyone's; everyone's on the wall panels
	const mine = useMyTodoCounts(lists);
	const count = todoBadgeCount(lists, mine);
	if (lists.length === 0) return null;
	const title = count === 0 ? 'To-do' : `To-do: ${count} left`;

	return (
		<>
			<Button
				variant="outline"
				size={size}
				onClick={() => setOpen(true)}
				aria-label={title}
				title={title}
				className={cn('relative', className)}
			>
				<ListTodo />
				{(label || tile) && <span className={cn(!tile && 'max-[520px]:sr-only')}>To-do</span>}
				{count > 0 && <CountBadge>{count}</CountBadge>}
			</Button>
			<TodoDialog
				isOpen={open}
				onClose={() => {
					setOpen(false);
					clearLink();
				}}
				list={link?.todo}
				focusItem={link?.item || undefined}
				counts={mine}
			/>
		</>
	);
};

/** The brief's tab a link names (`?brief=affirmation`, `?brief=study`), else the brief. */
const linkedBriefTab = (link: { brief: string } | null): DailyBriefTab | undefined =>
	link?.brief === 'affirmation' || link?.brief === 'study' ? link.brief : undefined;

/**
 * Opens the daily brief (weather, today's calendar and the news, built at 7 AM), which can be
 * announced on a speaker, and a household member's daily affirmation: "Daily" for them, the daily
 * brief elsewhere. `label` adds "Daily" ("Brief"; hidden on the narrowest phones). The morning
 * notification's link (`?brief=1`) opens it, and the daily affirmation's (`?brief=affirmation`) opens
 * it on the signed-in household member's affirmation.
 */
export const DailyBriefButton: React.FC<HeaderButtonProps & TileProps> = ({
	size = 'icon-xl',
	label,
	tile,
	className,
}) => {
	const [open, setOpen] = useState(false);
	const [link, clearLink] = useLinkedParams(['brief']);
	// "Daily": the brief, today's scripture and this week's lesson, and a household member's affirmation
	const name = 'Daily';
	useEffect(() => {
		if (link) setOpen(true);
	}, [link]);

	return (
		<>
			<Button
				variant="outline"
				size={size}
				onClick={() => setOpen(true)}
				aria-label={name}
				title={name}
				className={className}
			>
				<Newspaper />
				{(label || tile) && <span className={cn(!tile && 'max-[520px]:sr-only')}>Daily</span>}
			</Button>
			<DailyBriefDialog
				isOpen={open}
				onClose={() => {
					setOpen(false);
					clearLink();
				}}
				tab={linkedBriefTab(link)}
			/>
		</>
	);
};

/** Opens the camera viewer; amber with a pulsing icon while any camera detects something. */
export const CamerasButton: React.FC<HeaderButtonProps> = ({ size = 'icon-xl', className }) => {
	const [open, setOpen] = useState(false);
	const activity = useCameraActivity();
	const title =
		activity.length > 0
			? `Cameras: ${activity.map((a) => `${a.detections.map((d) => d.label).join(', ')} at ${a.cameraLabel}`).join('; ')}`
			: 'Cameras';

	return (
		<>
			<Button
				variant={activity.length > 0 ? 'warning' : 'outline'}
				size={size}
				onClick={() => setOpen(true)}
				// What was detected and where, for screen readers too (a title never shows on touch)
				aria-label={title}
				title={title}
				className={className}
			>
				<Cctv className={cn(activity.length > 0 && 'animate-pulse')} />
			</Button>
			<CameraModal isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
};

type MoreDialog = 'brief' | 'intercom' | 'tv' | 'energy' | 'wifi';

/** A tile in the More menu: the icon over its label and a line of detail, two across. */
const MORE_TILE =
	"h-20 min-w-0 flex-1 basis-32 flex-col gap-1 px-2 text-sm has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-5";

/**
 * The panel header's More (a grid icon, labeled from 2xl; it was a bare ⋯, which nobody knew to
 * open), a popover of labeled tiles: the daily brief, the intercom, the TVs (with how many are on) and energy
 * (with the house's live draw, when Home Assistant's Energy settings have a grid meter), the guest
 * Wi-Fi's QR code (the wall panels, where guests are; `GuestWifiDialog`), plus Home
 * Assistant's appearance with `colorSchemePicker` (the Home dashboard), which
 * don't fit beside everything else at 960px (or at 1280px once "N Open" shows). Owns their dialogs
 * as their buttons do: the brief opens from its notifications' links (`?brief=1`,
 * `?brief=affirmation`), and the intercom stays mounted (it sweeps old voice clips).
 */
export const MoreButton: React.FC<{ tvRemote?: boolean; colorSchemePicker?: boolean; className?: string }> = ({
	tvRemote,
	colorSchemePicker,
	className,
}) => {
	const [menuOpen, setMenuOpen] = useState(false);
	const [dialog, setDialog] = useState<MoreDialog | null>(null);
	const [link, clearLink] = useLinkedParams(['brief']);
	useEffect(() => {
		if (link) setDialog('brief');
	}, [link]);
	const tvs = useTvs();
	const daily = useModule('daily');
	const messages = useModule('messages');
	const tvModule = useModule('tvs');
	const energyModule = useModule('energy');
	const guestWifiModule = useModule('guest_wifi');
	const energy = !!useEnergyModel() && energyModule;
	const tvsOn = tvs.filter((tv) => tv.state === 'on').length;
	const wallPanel = useWallPanel();
	const guestWifi = !!useGuestWifi() && wallPanel && guestWifiModule;
	const close = () => {
		setDialog(null);
		clearLink();
	};
	// A labeled tile each, like the phone header's: what's behind the button is named, never a bare list
	const tile = (key: MoreDialog, Icon: typeof Newspaper, label: string, hint?: React.ReactNode) => (
		<Button
			variant="outline"
			size="xl"
			onClick={() => {
				setMenuOpen(false);
				setDialog(key);
			}}
			className={MORE_TILE}
		>
			<Icon />
			<span>{label}</span>
			{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		</Button>
	);
	// Nothing in it for this house (none of its modules, no appearance picker): no button at all
	const tvTile = tvModule && tvs.length > 0;
	if (!daily && !energy && !guestWifi && !messages && !tvTile && !colorSchemePicker && !dialog) return null;

	return (
		<>
			<Popover open={menuOpen} onOpenChange={setMenuOpen}>
				<PopoverTrigger asChild>
					{/* "More" beside its grid from 2xl (a desktop window); the icon alone where the header is full */}
					<Button
						variant="outline"
						size="xl"
						aria-label="More"
						title="More: Daily, Messages, TVs, Energy"
						className={cn('max-2xl:w-12 max-2xl:has-[>svg]:px-0', className)}
					>
						<LayoutGrid />
						<span className="max-2xl:sr-only">More</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="flex w-80 flex-col gap-2 p-2">
					{/* Alphabetical, two across; a lone last one takes the row */}
					<div className="flex flex-wrap gap-2">
						{daily && tile('brief', Newspaper, 'Daily')}
						{energy && tile('energy', Zap, 'Energy', <HouseWatts />)}
						{guestWifi && tile('wifi', Wifi, 'Guest Wi-Fi')}
						{messages && tile('intercom', MessagesSquare, 'Messages')}
						{tvTile && tile('tv', TvIcon, 'TVs', tvsOn > 0 ? `${tvsOn} on` : undefined)}
					</div>
					{/* This device's Light / Dark / Auto (the Home dashboard; the wall panels stay dark) */}
					{colorSchemePicker && (
						<div className="flex flex-col gap-1.5 border-t px-1.5 pt-2.5 pb-1">
							<span className="text-muted-foreground text-xs">Appearance</span>
							<ColorSchemeToggle />
						</div>
					)}
				</PopoverContent>
			</Popover>
			<DailyBriefDialog isOpen={dialog === 'brief'} onClose={close} tab={linkedBriefTab(link)} />
			<IntercomDialog isOpen={dialog === 'intercom'} onClose={close} />
			<TvDialog isOpen={dialog === 'tv'} onClose={close} remote={tvRemote} />
			<EnergyDialog isOpen={dialog === 'energy'} onClose={close} />
			<GuestWifiDialog isOpen={dialog === 'wifi'} onClose={close} />
		</>
	);
};

const STACK = 'flex -space-x-3 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background max-xl:-space-x-2';
const AVATAR = 'size-12 max-lg:size-10';

/** Overlapping avatars of tracked people (grayscale when away); the stack opens where everyone is. */
export const PeopleStack: React.FC<{ avatarClassName?: string; stackClassName?: string; className?: string }> = ({
	avatarClassName = AVATAR,
	stackClassName,
	className,
}) => {
	const [open, setOpen] = useState(false);
	// Tracked people (person.* with a device tracker), same list as the people dialog
	const members = useHassSelector((hass) => (hass ? discoverPeople(hass.states) : []), { watch: PEOPLE_WATCH });
	if (members.length === 0 && !open) return null;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Show where everyone is"
				className={cn(STACK, stackClassName, 'rounded-full touch:max-lg:py-1', className)}
			>
				{members.map((member) => (
					<Avatar
						key={member.entityId}
						title={`${member.shortName}: ${member.locationLabel}`}
						className={cn(avatarClassName, !member.isHome && 'grayscale')}
					>
						<AvatarImage src={member.picture} alt={member.shortName} />
						<AvatarFallback>{member.initials}</AvatarFallback>
					</Avatar>
				))}
			</button>
			<PeopleDialog isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
};

/**
 * Pet avatars with an amber dot when the litter box or feeder needs attention; opens pet care.
 * Renders nothing without pets; `before` (e.g. a divider) shows only when there are some.
 */
export const PetsStack: React.FC<{
	avatarClassName?: string;
	/** Overlap override (e.g. tighter on phones). */
	stackClassName?: string;
	className?: string;
	before?: React.ReactNode;
}> = ({ avatarClassName = AVATAR, stackClassName, className, before }) => {
	const [open, setOpen] = useState(false);
	// Pets (person.* with Litter-Robot pet sensors), flagged when the litter box or feeder needs attention
	const pets = useHassSelector((hass) => (hass ? discoverPets(hass.states) : []), { watch: PET_CARE_WATCH });
	const alert = useHassSelector(
		(hass) => !!hass && petCareNeedsAttention(discoverLitterBoxes(hass.states), discoverFeeders(hass.states)),
		{ watch: PET_CARE_WATCH },
	);
	if (pets.length === 0) return null;

	return (
		<>
			{before}
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Show pet care"
				className={cn('relative rounded-full touch:max-lg:py-1', className)}
			>
				{/* The avatars get their own row: as a sibling, the dot would end -space-x-3's overlap */}
				<span className={cn(STACK, stackClassName)}>
					{pets.map((pet) => (
						<Avatar key={pet.entityId} title={pet.name} className={avatarClassName}>
							<AvatarImage src={pet.picture} alt={pet.name} />
							<AvatarFallback>{pet.initials}</AvatarFallback>
						</Avatar>
					))}
				</span>
				{/* On the last avatar's rim, like a notification badge */}
				{alert && <span className="absolute top-0 right-0 size-3 rounded-full bg-warning ring-2 ring-background" />}
			</button>
			<PetsDialog isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
};
