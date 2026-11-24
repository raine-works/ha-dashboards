/**
 * The Home dashboard, for everyone's own devices: the wall panel layout on wide screens, a tab
 * per section on phones.
 */

import { PanelAlerts } from '@app/ui/alerts';
import { CameraModal, useCameraActivity } from '@app/ui/camera';
import { ClimateSection } from '@app/ui/climate';
import { Button, ChipRow, Separator } from '@app/ui/components';
import {
	AssistButton,
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
import { useLinkedCamera } from '@app/ui/hooks/useLinkedCamera';
import { useLinkedParams } from '@app/ui/hooks/useLinkedParams';
import { SHORT_QUERY, useMediaQuery } from '@app/ui/hooks/useMediaQuery';
import { IntercomDialog } from '@app/ui/intercom';
import { ErrorBoundary, PanelLayout } from '@app/ui/layout';
import { readStored, writeStored } from '@app/ui/lib/storage';
import { cn } from '@app/ui/lib/utils';
import { LightingSection, type LightingSectionProps } from '@app/ui/lighting';
import { ModuleGate, useModule } from '@app/ui/modules';
import { MiniPlayer, useMusicActive } from '@app/ui/music';
import { SecuritySection } from '@app/ui/security';
import { TvButton } from '@app/ui/tv';
import { Cctv, Lightbulb, type LucideIcon, MessagesSquare, Music, ShieldCheck, Thermometer } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { CamerasView } from './views/CamerasView';
import { MusicView } from './views/MusicView';

/** Wide enough for the wall panel layout (its header needs ~960px); narrower gets the phone tabs. */
export const WIDE_QUERY = '(min-width: 1024px)';

/** Every light and scene in the house, top floor first (like looking at the house). */
const LIGHTING: LightingSectionProps = {
	title: 'Lighting',
	allFloors: true,
};

/** The Home dashboard's pages (a tab each on phones). */
export type View = 'lights' | 'security' | 'climate' | 'music' | 'cameras';

const VIEWS: { id: View; label: string; icon: LucideIcon }[] = [
	{ id: 'lights', label: 'Lights', icon: Lightbulb },
	{ id: 'security', label: 'Security', icon: ShieldCheck },
	{ id: 'climate', label: 'Climate', icon: Thermometer },
	{ id: 'music', label: 'Music', icon: Music },
	{ id: 'cameras', label: 'Cameras', icon: Cctv },
];

/** The tab bar: the tabs either side of the Assist button. Cameras opens from Security's Cameras card. */
const TABS = VIEWS.filter((v) => v.id !== 'cameras');

// Bottom tab bar and mini player heights, so toasts sit above them (the bar is icons only, 44px,
// in a short window: a phone on its side, where the mini player hides too)
const TAB_BAR_PX = 72;
const SHORT_TAB_BAR_PX = 44;
const MINI_PLAYER_PX = 57;
const VIEW_KEY = 'home-dashboard:view';

/** The last tab, per device (falls back to Lights, e.g. for a view from before the tabs changed). */
function useStoredView(): [View, (view: View) => void] {
	const [view, setView] = useState<View>(() => {
		const saved = readStored(VIEW_KEY);
		return VIEWS.some((v) => v.id === saved) ? (saved as View) : 'lights';
	});
	const update = (next: View) => {
		setView(next);
		writeStored(VIEW_KEY, next);
	};
	return [view, update];
}

/**
 * Desktop and landscape tablets: the wall panels' own layout (their header with music, cameras and
 * intercom, then Lighting | Security | Climate), filling the window with each column
 * scrolling on its own.
 */
const WideLayout: React.FC = () => (
	<div className="mx-auto flex size-full max-w-400 flex-col">
		{/* Alerts are mounted once by HomeDashboard, so they survive a switch to the phone layout */}
		<PanelLayout alerts={false} tvRemote greeting sidebarButton colorSchemePicker>
			<main className="grid min-h-0 flex-1 grid-cols-3 grid-rows-1 gap-4 *:min-w-0">
				<LightingSection {...LIGHTING} />
				<SecuritySection />
				<ClimateSection />
			</main>
		</PanelLayout>
	</div>
);

/** Tablets in portrait: room enough to keep the header in view while the page scrolls. */
const STICKY_HEADER_QUERY = '(min-width: 768px)';

const PhoneHeader: React.FC<{ onIntercom: () => void; sticky: boolean; onHeight: (px: number) => void }> = ({
	onIntercom,
	sticky,
	onHeight,
}) => {
	// Big enough to tell who's who, with initials that fit
	const avatars = 'size-8 text-xs';
	// Its height, for what sticks under it (Lighting's tabs and floor names)
	const [el, setEl] = useState<HTMLElement | null>(null);
	useEffect(() => {
		if (!el) return;
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
				<SidebarButton />
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
			{/* Who's home, then what the house is doing now: a ChipRow at the right, scrolling sideways when
			    the open doors, notifications and laundry show too; room past its box for the count badge */}
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
					<PushSettingsButton size="icon-sm" />
					{/* This device's Light / Dark / Auto */}
					<ColorSchemeButton size="icon-sm" />
				</ChipRow>
			</div>
			{/* What opens a dialog, a labeled tile each, in alphabetical order, sharing the width (a missing
			    one leaves the rest wider) */}
			<div className="flex gap-2">
				<ModuleGate id="daily">
					<DailyBriefButton size="xl" tile className={HEADER_TILE} />
				</ModuleGate>
				<ModuleGate id="messages">
					<Button variant="outline" size="xl" onClick={onIntercom} className={HEADER_TILE}>
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

const TabBar: React.FC<{ view: View; onViewChange: (view: View) => void; showMiniPlayer: boolean }> = ({
	view,
	onViewChange,
	showMiniPlayer,
}) => {
	const cameraActivity = useCameraActivity().length > 0;
	// The tabs the house has (Music only with Music Assistant), split either side of Assist
	const music = useModule('music');
	const assist = useModule('assist');
	const tabs = TABS.filter((t) => t.id !== 'music' || music);
	const perSide = Math.ceil(tabs.length / 2);
	const tab = ({ id, label, icon: Icon }: (typeof TABS)[number]) => {
		// The Cameras view is part of Security: its tab stays marked there, and carries the detection dot
		const current = view === id || (id === 'security' && view === 'cameras');
		return (
			<button
				key={id}
				type="button"
				onClick={() => onViewChange(id)}
				aria-current={current ? 'page' : undefined}
				className="group flex flex-col items-center gap-1 short:py-1 pt-2 pb-1.5 font-medium text-muted-foreground text-xs aria-[current=page]:text-foreground"
			>
				{/* The controls' radius (buttons, toggles, sliders), like the toggle groups' selected item */}
				<span className="relative flex h-8 w-14 items-center justify-center rounded-md transition-colors group-aria-[current=page]:bg-accent">
					<Icon className="size-5" />
					{id === 'security' && cameraActivity && (
						<span className="absolute top-1 right-3 size-2 rounded-full bg-warning ring-2 ring-background" />
					)}
				</span>
				{/* Icons only in a short window, leaving the content room */}
				<span className="short:sr-only">{label}</span>
			</button>
		);
	};
	return (
		<div className="fixed inset-x-0 bottom-0 z-40">
			{showMiniPlayer && <MiniPlayer onOpen={() => onViewChange('music')} />}
			{/* Clear of the home indicator, and of the notch on a phone on its side */}
			<nav
				aria-label="Sections"
				className="border-t bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
			>
				{/* Equal columns, however many tabs the house has */}
				<div className="grid auto-cols-fr grid-flow-col items-center">
					{tabs.slice(0, perSide).map(tab)}
					{/* Voice commands, under the thumb on every tab: a circle in the Assist colors, in the middle of the tabs */}
					{assist && (
						<div className="flex items-center justify-center">
							<AssistButton round className="short:size-9" />
						</div>
					)}
					{tabs.slice(perSide).map(tab)}
					{/* An odd number of tabs: an empty column keeps Assist in the middle */}
					{assist && tabs.length % 2 === 1 && <div aria-hidden />}
				</div>
			</nav>
		</div>
	);
};

/**
 * Phones and portrait tablets: one section per tab (the same Lighting, Security and Climate
 * as the wall panels, plus Music; Cameras opens from Security), with a compact header and a bottom tab bar.
 * The page scrolls.
 */
const PhoneLayout: React.FC<{ view: View; onViewChange: (view: View) => void; showMiniPlayer: boolean }> = ({
	view: picked,
	onViewChange,
	showMiniPlayer,
}) => {
	// The Music tab (remembered, or `?view=music`) is Lights in a house without Music Assistant
	const music = useModule('music');
	const view = picked === 'music' && !music ? 'lights' : picked;
	const [intercomOpen, setIntercomOpen] = useState(false);
	// On a tablet the header stays in view; what sticks on the page then sticks under it
	const stickyHeader = useMediaQuery(STICKY_HEADER_QUERY);
	const [headerHeight, setHeaderHeight] = useState(0);
	const pageHeader = { '--page-header': `${stickyHeader ? headerHeight : 0}px` } as React.CSSProperties;

	const changeView = (next: View) => {
		onViewChange(next);
		window.scrollTo({ top: 0 });
	};

	return (
		<div
			style={pageHeader}
			className="relative box-border flex min-h-full flex-col overflow-x-clip bg-background font-sans text-foreground"
		>
			<PhoneHeader onIntercom={() => setIntercomOpen(true)} sticky={stickyHeader} onHeight={setHeaderHeight} />
			{/* Room at the bottom for the fixed tab bar (and the mini player) */}
			<main
				className={cn(
					'box-border w-full flex-1 p-4 pb-[calc(--spacing(22)+env(safe-area-inset-bottom))] short:pb-[calc(--spacing(15)+env(safe-area-inset-bottom))]',
					showMiniPlayer && 'pb-[calc(--spacing(36)+env(safe-area-inset-bottom))]',
				)}
			>
				{view === 'lights' && <LightingSection {...LIGHTING} pageScroll />}
				{view === 'security' && <SecuritySection compact onViewCameras={() => changeView('cameras')} />}
				{view === 'climate' && <ClimateSection />}
				{view === 'music' && (
					<ErrorBoundary name="Music">
						<MusicView />
					</ErrorBoundary>
				)}
				{view === 'cameras' && (
					<ErrorBoundary name="Cameras">
						<CamerasView onBack={() => changeView('security')} />
					</ErrorBoundary>
				)}
			</main>
			<TabBar view={view} onViewChange={changeView} showMiniPlayer={showMiniPlayer} />
			<IntercomDialog isOpen={intercomOpen} onClose={() => setIntercomOpen(false)} />
		</div>
	);
};

/**
 * Home dashboard for desktop and phone, with the wall panels' scope: lighting (every light and scene,
 * top floor first), security, climate, music, cameras and intercom. Wide screens get the
 * panel layout filling the window; phones get a tab per section and a scrolling page.
 */
export const HomeDashboard: React.FC = () => {
	const wide = useMediaQuery(WIDE_QUERY);
	const short = useMediaQuery(SHORT_QUERY);
	// Kept here, with the alerts, so turning a tablet between the layouts keeps the phone's tab
	const [view, setView] = useStoredView();
	// A notification's tap opens its tab (`?view=security` for the alarm); wide screens show every section
	const [linkedView, clearLinkedView] = useLinkedParams(['view']);
	useEffect(() => {
		if (!linkedView) return;
		if (VIEWS.some((v) => v.id === linkedView.view)) setView(linkedView.view as View);
		clearLinkedView();
	}, [linkedView]);
	// A now-playing bar above the tabs while something is loaded (not on the Music tab, nor in a short window)
	const showMiniPlayer = useMusicActive() && view !== 'music' && !short;
	// A doorbell or package notification's tap opens its camera (`?camera=<entity>` in the link)
	const [linkedCamera, clearLinkedCamera] = useLinkedCamera();

	// Toasts clear the phone's tab bar (and mini player) at every width it shows at
	const bottom = (short ? SHORT_TAB_BAR_PX : TAB_BAR_PX) + (showMiniPlayer ? MINI_PLAYER_PX : 0) + 8;
	return (
		<>
			{/* Home Assistant's toolbar is hidden: the safe area above the page (a notch, the status bar)
			    stays the page's color as it scrolls */}
			<div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-(--panel-top) bg-background" />
			{wide ? <WideLayout /> : <PhoneLayout view={view} onViewChange={setView} showMiniPlayer={showMiniPlayer} />}
			{/* Toasts (doors/windows, alarm, doorbell) and the doorbell live view, once for both layouts */}
			<PanelAlerts mobileOffset={wide ? undefined : { bottom }} offset={wide ? undefined : { bottom, left: 16 }} />
			{linkedCamera && (
				<CameraModal key={linkedCamera} isOpen initialCamera={linkedCamera} onClose={clearLinkedCamera} />
			)}
		</>
	);
};
