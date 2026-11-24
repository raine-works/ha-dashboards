/**
 * The TV dialog and its header button, and the hooks that find the house's TVs.
 *
 * @module
 */

import {
	Apple,
	ArrowLeft,
	Cable,
	Camera,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Disc3,
	Gamepad2,
	House,
	Laptop,
	Loader2,
	Monitor,
	Pause,
	Play,
	Power,
	SkipBack,
	SkipForward,
	Speaker,
	Tv as TvIcon,
	Volume2,
	VolumeX,
} from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useBusy } from '../../hooks/useBusy';
import { readStored, writeStored } from '../../lib/storage';
import { hapticTap } from '../../lib/tones';
import {
	defaultTv,
	discoverTvs,
	isConsoleInput,
	REMOTE_KEYS,
	type RemoteKey,
	TV_FEATURE,
	TVS_WATCH,
	type Tv,
	type TvApp,
	type TvInput,
	type TvInputKind,
	tvInArea,
	tvStatus,
	tvSupports,
} from '../../lib/tv';
import { cn } from '../../lib/utils';
import { IconNintendoSwitch, IconXbox } from '../Icons';
import { VolumeSlider } from '../music/Speakers';
import {
	Button,
	type ButtonProps,
	ChipRow,
	CountBadge,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	StableLabel,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '../ui';

const TV_KEY = 'tv-dialog:tv';

/** Every TV (Raineworks TV), live; none while not `enabled` (a closed dialog needs no scan). */
export const useTvs = (enabled = true): Tv[] =>
	useHassSelector((hass) => (hass && enabled ? discoverTvs(hass.states, hass) : []), { watch: TVS_WATCH });

/** The TV in a speaker's room (a soundbar's TV), live; none without a speaker. */
export const useSpeakerTv = (speakerId: string | undefined): Tv | undefined =>
	useHassSelector(
		(hass) => (hass && speakerId ? tvInArea(discoverTvs(hass.states, hass), speakerId, hass) : undefined),
		{ watch: TVS_WATCH },
	);

/** The last TV picked on this device (falls back when storage is unavailable). */
const readStoredTv = () => readStored(TV_KEY) ?? undefined;

function useStoredTv(initial?: string): [string | undefined, (id: string) => void] {
	const [id, setId] = useState<string | undefined>(() => initial ?? readStoredTv());
	const update = (next: string) => {
		setId(next);
		writeStored(TV_KEY, next);
	};
	return [id, update];
}

/**
 * Power, apps, inputs, volume and playback for the TVs. Power, app launches and inputs stay busy
 * until the TV reports them (TVs take seconds to wake); an app or input on a TV that's off turns
 * it on first (the integration wakes it).
 */
function useTvControls() {
	const { callService, waitFor } = useHassApi();
	const busy = useBusy();
	const call = (tv: Tv, service: string, data: Record<string, unknown> = {}) =>
		callService('media_player', service, { entity_id: tv.entityId, ...data });

	return {
		isBusy: (tv: Tv, action: string) => busy.isBusy(`${tv.entityId}:${action}`),
		power: (tv: Tv) =>
			busy.run(`${tv.entityId}:power`, async () => {
				const on = tv.state === 'on';
				await call(tv, on ? 'turn_off' : 'turn_on');
				await waitFor((hass) => (hass.states[tv.entityId]?.state === 'off') === on);
			}),
		launch: (tv: Tv, app: TvApp) =>
			busy.run(`${tv.entityId}:app:${app.packageName}`, async () => {
				await call(tv, 'play_media', { media_content_type: 'app', media_content_id: app.packageName });
				await waitFor((hass) => hass.states[tv.entityId]?.attributes.app_id === app.packageName);
			}),
		selectInput: (tv: Tv, input: TvInput) =>
			busy.run(`${tv.entityId}:input:${input.id}`, async () => {
				await call(tv, 'select_source', { source: input.id });
				await waitFor((hass) => hass.states[tv.entityId]?.attributes.input === input.id);
			}),
		setVolume: (tv: Tv, percent: number) => call(tv, 'volume_set', { volume_level: percent / 100 }),
		mute: (tv: Tv) => call(tv, 'volume_mute', { is_volume_muted: !tv.muted }),
		// What the button shows, never a toggle the TV decides from a state a second old
		playPause: (tv: Tv) => call(tv, tv.nowPlaying?.state === 'playing' ? 'media_pause' : 'media_play'),
		previous: (tv: Tv) => call(tv, 'media_previous_track'),
		next: (tv: Tv) => call(tv, 'media_next_track'),
		/** Press a remote key (an arrow, OK, Back, Home). */
		press: (tv: Tv, key: RemoteKey) =>
			tv.remoteEntityId &&
			callService('remote', 'send_command', { entity_id: tv.remoteEntityId, command: REMOTE_KEYS[key] }),
	};
}

type TvControls = ReturnType<typeof useTvControls>;

/** Each console's logo and its brand color, the background of its tile (like an app's icon). */
const CONSOLE_LOGOS: Partial<Record<TvInputKind, { Icon: typeof IconXbox; color: string }>> = {
	xbox: { Icon: IconXbox, color: '#107C10' },
	nintendo_switch: { Icon: IconNintendoSwitch, color: '#E60012' },
};

/** An icon for what's on an input, by the kind the integration gives it. */
const KIND_ICONS: Partial<Record<TvInputKind, typeof Cable>> = {
	apple_tv: Apple,
	laptop: Laptop,
	computer: Monitor,
	streamer: TvIcon,
	cable: TvIcon,
	disc: Disc3,
	audio: Speaker,
	camera: Camera,
};

/** An input's icon: its console's logo, a controller for another console, else what it is, else a cable. */
const InputGlyph: React.FC<{ input: TvInput; className?: string }> = ({ input, className }) => {
	const Icon =
		CONSOLE_LOGOS[input.kind]?.Icon ?? (isConsoleInput(input) ? Gamepad2 : (KIND_ICONS[input.kind] ?? Cable));
	return <Icon className={className} />;
};

/**
 * An app's icon (its Google Play icon, rounded like a launcher's), the input on screen's (a
 * console's logo on its brand color), or a TV for none.
 */
const AppIcon: React.FC<{ app?: TvApp; input?: TvInput; on?: boolean; className?: string }> = ({
	app,
	input,
	on,
	className,
}) => {
	// Failed loads by URL, so a new icon gets its own try
	const [failed, setFailed] = useState<string>();
	if (input) {
		const logo = CONSOLE_LOGOS[input.kind];
		return (
			<span
				className={cn(
					'flex shrink-0 items-center justify-center rounded-[22%] bg-primary text-primary-foreground',
					className,
				)}
				style={logo && { backgroundColor: logo.color, color: '#fff' }}
			>
				<InputGlyph input={input} className="size-1/2" />
			</span>
		);
	}
	if (app?.icon && failed !== app.icon) {
		return (
			<img
				src={app.icon}
				alt=""
				draggable={false}
				onError={() => setFailed(app.icon)}
				className={cn('shrink-0 rounded-[22%] bg-muted object-cover', className)}
			/>
		);
	}
	return (
		<span
			className={cn(
				'flex shrink-0 items-center justify-center rounded-[22%] bg-muted text-muted-foreground',
				on && 'bg-primary text-primary-foreground',
				className,
			)}
		>
			<TvIcon className="size-1/2" />
		</span>
	);
};

/** An app to launch: its icon over its name, like the TV's own launcher. */
const AppTile: React.FC<{
	app: TvApp;
	current: boolean;
	loading: boolean;
	disabled: boolean;
	onLaunch: () => void;
}> = ({ app, current, loading, disabled, onLaunch }) => (
	<button
		type="button"
		onClick={loading ? undefined : onLaunch}
		disabled={disabled}
		aria-pressed={current}
		aria-busy={loading || undefined}
		aria-label={`Open ${app.name}`}
		className="group flex min-w-0 flex-col items-center gap-2 rounded-lg p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
	>
		<span
			className={cn(
				'relative rounded-[22%] transition-transform group-active:scale-95',
				current && 'ring-3 ring-primary ring-offset-2 ring-offset-background',
			)}
		>
			<AppIcon app={app} className="size-20 max-sm:size-16" />
			{loading && (
				<span className="absolute inset-0 flex items-center justify-center rounded-[22%] bg-black/55 text-white">
					<Loader2 className="size-6 animate-spin" />
				</span>
			)}
		</span>
		<span className="w-full truncate text-center font-medium text-sm">{app.name}</span>
	</button>
);

/** The TVs with what each shows; picking one shows it beside the list. */
const TvList: React.FC<{ tvs: Tv[]; selected?: string; onSelect: (id: string) => void }> = ({
	tvs,
	selected,
	onSelect,
}) => (
	// Phones: a strip; wider screens: a column
	<nav
		aria-label="TVs"
		className="flex shrink-0 gap-2 overflow-x-auto p-0.5 max-md:-mx-1 max-md:px-1 md:w-56 md:flex-col md:overflow-x-visible"
	>
		{tvs.map((tv) => (
			<button
				key={tv.entityId}
				type="button"
				aria-pressed={tv.entityId === selected}
				onClick={() => onSelect(tv.entityId)}
				className="flex min-w-0 shrink-0 items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent max-md:w-44"
			>
				<AppIcon app={tv.app} input={tv.input} on={tv.state === 'on'} className="size-10" />
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-sm">{tv.name}</span>
					<span className="truncate text-muted-foreground text-xs">{tvStatus(tv)}</span>
				</span>
			</button>
		))}
	</nav>
);

// Holding an arrow repeats it (scrolling through a row), after this long, this often
const REPEAT_AFTER_MS = 450;
const REPEAT_EVERY_MS = 180;

/**
 * Press handling for a remote key: it sends on pointer down with a haptic tap (and again and again
 * while held, with `repeat`), and once for a keyboard press (Enter, Space). `held` is for the
 * pressed look, since `:active` is unreliable on touch once the pointer is captured.
 */
function useRemotePress(onPress: () => void, repeat = false) {
	const [held, setHeld] = useState(false);
	const send = () => {
		hapticTap();
		onPress();
	};
	useEffect(() => {
		if (!held || !repeat) return;
		let interval: ReturnType<typeof setInterval> | undefined;
		const delay = setTimeout(() => {
			interval = setInterval(send, REPEAT_EVERY_MS);
		}, REPEAT_AFTER_MS);
		return () => {
			clearTimeout(delay);
			clearInterval(interval);
		};
	}, [held, repeat]);
	const release = () => setHeld(false);
	return {
		held,
		handlers: {
			onPointerDown: (e: PointerEvent) => {
				if (e.button !== 0) return;
				(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
				send();
				setHeld(true);
			},
			onPointerUp: release,
			onPointerCancel: release,
			onLostPointerCapture: release,
			// A pointer press already sent; a keyboard one (detail 0) sends here
			onClick: (e: MouseEvent) => e.detail === 0 && send(),
		},
	};
}

type Direction = 'up' | 'right' | 'down' | 'left';

/** Each arrow is a quarter of the pad, a wedge from its center to its edge (its whole hit area). */
const WEDGES: Record<Direction, { clip: string; icon: string; Icon: typeof ChevronUp; label: string }> = {
	up: {
		clip: 'polygon(50% 50%, 0 0, 100% 0)',
		icon: 'top-[9%] left-1/2 -translate-x-1/2',
		Icon: ChevronUp,
		label: 'Up',
	},
	right: {
		clip: 'polygon(50% 50%, 100% 0, 100% 100%)',
		icon: 'top-1/2 right-[9%] -translate-y-1/2',
		Icon: ChevronRight,
		label: 'Right',
	},
	down: {
		clip: 'polygon(50% 50%, 100% 100%, 0 100%)',
		icon: 'bottom-[9%] left-1/2 -translate-x-1/2',
		Icon: ChevronDown,
		label: 'Down',
	},
	left: {
		clip: 'polygon(50% 50%, 0 100%, 0 0)',
		icon: 'top-1/2 left-[9%] -translate-y-1/2',
		Icon: ChevronLeft,
		label: 'Left',
	},
};

const Wedge: React.FC<{ direction: Direction; onPress: () => void; disabled: boolean }> = ({
	direction,
	onPress,
	disabled,
}) => {
	const { held, handlers } = useRemotePress(onPress, true);
	const { clip, icon, Icon, label } = WEDGES[direction];
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			data-held={held || undefined}
			style={{ clipPath: clip }}
			className="group absolute inset-0 touch-none select-none text-muted-foreground outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent data-held:bg-accent data-held:text-foreground"
			{...handlers}
		>
			<Icon
				className={cn('absolute size-9 transition-transform group-data-held:scale-90 max-sm:size-8', icon)}
				strokeWidth={2.25}
			/>
		</button>
	);
};

/** The pad's OK, a big round button in its middle. */
const SelectButton: React.FC<{ onPress: () => void; disabled: boolean }> = ({ onPress, disabled }) => {
	const { held, handlers } = useRemotePress(onPress);
	return (
		<button
			type="button"
			aria-label="OK"
			title="OK"
			disabled={disabled}
			data-held={held || undefined}
			className="absolute inset-[30%] touch-none select-none rounded-full bg-primary font-semibold text-primary-foreground text-xl shadow-md outline-none ring-4 ring-card transition-transform focus-visible:ring-ring/50 data-held:scale-95 max-sm:text-lg"
			{...handlers}
		>
			OK
		</button>
	);
};

/** A wide key under the pad (Back, Home). */
const PadKey: React.FC<{
	label: string;
	icon: typeof ArrowLeft;
	onPress: () => void;
	disabled: boolean;
}> = ({ label, icon: Icon, onPress, disabled }) => {
	const { held, handlers } = useRemotePress(onPress);
	return (
		<Button
			variant="outline"
			size="xl"
			disabled={disabled}
			data-held={held || undefined}
			className="h-14 flex-1 touch-none select-none rounded-full data-held:scale-[0.97]"
			{...handlers}
		>
			<Icon className="size-5" />
			{label}
		</Button>
	);
};

// Keyboard keys for the pad on desktop, while it has focus
const KEYBOARD: Record<string, RemoteKey> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	Backspace: 'back',
	Escape: 'back',
};

/**
 * A remote like the TV's own: a round pad whose four quarters are the arrows (each a quarter of
 * the pad to hit), OK in the middle, and Back and Home under it. As wide as the panel allows, but
 * no taller than half the screen, so it fits on the wall panels. With focus in it, the keyboard's
 * arrows, Backspace and Escape work too (Escape doesn't close the dialog then).
 */
const RemotePad: React.FC<{ tv: Tv; controls: TvControls }> = ({ tv, controls }) => {
	const disabled = tv.state !== 'on' || !tv.remoteEntityId;
	const key = (k: RemoteKey) => () => controls.press(tv, k);
	return (
		<div
			role="group"
			aria-label="Remote"
			// Its keys buzz as the finger lands (and repeat), not on the page-wide click
			data-haptic="off"
			className={cn('mx-auto flex w-full flex-col items-center gap-4 py-2', disabled && 'opacity-50')}
			style={{ maxWidth: 'min(26rem, calc(var(--panel-height) * 0.5))' }}
			onKeyDown={(e: KeyboardEvent) => {
				const k = KEYBOARD[e.key];
				if (!k || disabled) return;
				e.preventDefault();
				e.stopPropagation();
				hapticTap();
				controls.press(tv, k);
			}}
		>
			<div className="relative aspect-square w-full overflow-hidden rounded-full border bg-card shadow-sm">
				{(Object.keys(WEDGES) as Direction[]).map((direction) => (
					<Wedge key={direction} direction={direction} onPress={key(direction)} disabled={disabled} />
				))}
				{/* The lines between the arrows (under OK, which covers the middle) */}
				<svg
					aria-hidden
					viewBox="0 0 100 100"
					className="pointer-events-none absolute inset-0 size-full stroke-border"
					strokeWidth={0.6}
				>
					<line x1="14.6" y1="14.6" x2="85.4" y2="85.4" />
					<line x1="85.4" y1="14.6" x2="14.6" y2="85.4" />
				</svg>
				<SelectButton onPress={key('select')} disabled={disabled} />
			</div>
			<div className="flex w-full gap-3">
				<PadKey label="Back" icon={ArrowLeft} onPress={key('back')} disabled={disabled} />
				<PadKey label="Home" icon={House} onPress={key('home')} disabled={disabled} />
			</div>
		</div>
	);
};

/** What's on: the poster or cover of what's playing, else the app's icon or the input's. */
const OnScreenArt: React.FC<{ tv: Tv }> = ({ tv }) => {
	const [failed, setFailed] = useState<string>();
	const artwork = tv.nowPlaying?.artwork;
	if (artwork && failed !== artwork)
		return (
			<img
				src={artwork}
				alt=""
				draggable={false}
				onError={() => setFailed(artwork)}
				className="h-20 w-auto max-w-36 shrink-0 rounded-md bg-muted object-contain max-sm:h-16"
			/>
		);
	return <AppIcon app={tv.app} input={tv.input} on={tv.state === 'on'} className="size-14" />;
};

/** One TV: what's on with power, playback and volume, then the apps and inputs (or the remote). */
const TvPanel: React.FC<{ tv: Tv; controls: TvControls; remote: boolean }> = ({ tv, controls, remote }) => {
	const on = tv.state === 'on';
	const unavailable = tv.state === 'unavailable';
	const canLaunch = !unavailable && tvSupports(tv, TV_FEATURE.PLAY_MEDIA);
	const canPower = !unavailable && tvSupports(tv, on ? TV_FEATURE.TURN_OFF : TV_FEATURE.TURN_ON);
	const canSetVolume = on && tvSupports(tv, TV_FEATURE.VOLUME_SET);
	const playing = on ? tv.nowPlaying : undefined;
	const [tab, setTab] = useState<'apps' | 'remote'>('apps');
	const apps = (
		<div className="flex flex-col gap-4">
			{/* What's plugged in: tap to switch to it */}
			{tv.inputs.length > 0 && (
				<div className="flex flex-col gap-2">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Inputs</span>
					<ChipRow role="group" aria-label="Inputs">
						{tv.inputs.map((input) => (
							<Button
								key={input.id}
								variant={tv.input?.id === input.id ? 'default' : 'outline'}
								size="lg"
								aria-pressed={tv.input?.id === input.id}
								onClick={() => controls.selectInput(tv, input)}
								loading={controls.isBusy(tv, `input:${input.id}`)}
								disabled={unavailable || !tvSupports(tv, TV_FEATURE.SELECT_SOURCE)}
								title={[input.label === `HDMI ${input.port}` ? undefined : `HDMI ${input.port}`, input.device]
									.filter(Boolean)
									.join(' · ')}
							>
								<InputGlyph input={input} />
								{input.label}
							</Button>
						))}
					</ChipRow>
				</div>
			)}
			{tv.apps.length > 0 && (
				<div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5 xl:grid-cols-6">
					{tv.apps.map((app) => (
						<AppTile
							key={app.packageName}
							app={app}
							current={on && !tv.input && tv.appId === app.packageName}
							loading={controls.isBusy(tv, `app:${app.packageName}`)}
							disabled={!canLaunch}
							onLaunch={() => controls.launch(tv, app)}
						/>
					))}
				</div>
			)}
		</div>
	);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-0.5">
			{/* What's on (with its poster while something plays), and power */}
			<div className="flex shrink-0 items-center gap-4 rounded-lg border bg-card p-3">
				<OnScreenArt tv={tv} />
				{playing ? (
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-muted-foreground text-xs">
							{tv.name}
							{tv.appName ? ` · ${tv.appName}` : ''}
							{playing.state === 'paused' ? ' · Paused' : ''}
						</span>
						<span className="truncate font-semibold">{playing.title}</span>
						{playing.subtitle && <span className="truncate text-muted-foreground text-sm">{playing.subtitle}</span>}
					</span>
				) : (
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-semibold">{tv.name}</span>
						<span className="truncate text-muted-foreground text-sm">
							{on ? (tv.appName ? `On · ${tv.appName}` : 'On') : tvStatus(tv)}
						</span>
					</span>
				)}
				<Button
					variant={on ? 'outline' : 'default'}
					size="xl"
					onClick={() => controls.power(tv)}
					loading={controls.isBusy(tv, 'power')}
					disabled={!canPower}
					className="w-36 shrink-0 max-sm:w-auto"
				>
					<Power />
					<span className="max-sm:sr-only">{on ? 'Turn off' : 'Turn on'}</span>
				</Button>
			</div>

			{/* Playback and volume; always laid out, so a TV turning on never moves the apps */}
			<div className="flex shrink-0 flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="icon-xl"
					onClick={() => controls.previous(tv)}
					disabled={!playing || !tvSupports(tv, TV_FEATURE.PREVIOUS_TRACK)}
					aria-label="Previous"
				>
					<SkipBack />
				</Button>
				<Button
					variant="outline"
					size="xl"
					onClick={() => controls.playPause(tv)}
					disabled={!playing || !tvSupports(tv, TV_FEATURE.PAUSE)}
				>
					{playing?.state === 'paused' ? <Play /> : <Pause />}
					<StableLabel options={['Pause', 'Play']} value={playing?.state === 'paused' ? 1 : 0} />
				</Button>
				<Button
					variant="outline"
					size="icon-xl"
					onClick={() => controls.next(tv)}
					disabled={!playing || !tvSupports(tv, TV_FEATURE.NEXT_TRACK)}
					aria-label="Next"
				>
					<SkipForward />
				</Button>
				<span className="flex min-w-48 flex-1 items-center gap-2">
					<Button
						variant="outline"
						size="icon-xl"
						onClick={() => controls.mute(tv)}
						disabled={!on || !tvSupports(tv, TV_FEATURE.VOLUME_MUTE)}
						aria-label={tv.muted ? 'Unmute' : 'Mute'}
					>
						{tv.muted ? <VolumeX /> : <Volume2 />}
					</Button>
					<VolumeSlider
						value={tv.volume ?? 0}
						onCommit={(value) => controls.setVolume(tv, value)}
						label={`${tv.name} volume`}
						disabled={!canSetVolume}
						className="flex-1"
					/>
				</span>
			</div>

			{/* Apps or the remote, in the same room (so the panel never grows taller); apps alone without the remote */}
			{remote ? (
				<Tabs value={tab} onValueChange={(value) => setTab(value as 'apps' | 'remote')} className="shrink-0">
					<TabsList>
						<TabsTrigger value="apps">Apps</TabsTrigger>
						<TabsTrigger value="remote">Remote</TabsTrigger>
					</TabsList>
					<TabsContent value="remote">
						<RemotePad tv={tv} controls={controls} />
					</TabsContent>
					<TabsContent value="apps">{apps}</TabsContent>
				</Tabs>
			) : (
				<div className="shrink-0">{apps}</div>
			)}
		</div>
	);
};

/** The TV dialog's props: whether it's open, what closes it, the Remote tab and the TV shown first. */
export interface TvDialogProps {
	isOpen: boolean;
	onClose: () => void;
	/**
	 * The Remote tab (d-pad, OK, Back, Home). Only the Home dashboard (desktop and phones) shows it;
	 * the wall panels get power, playback, volume, the apps and inputs.
	 */
	remote?: boolean;
	/** The TV to show first (the music player's soundbar's), read when the dialog mounts. */
	initialTv?: string;
}

/** Every TV in the house: power, what's on, playback and volume, and its apps and inputs to open. */
export const TvDialog: React.FC<TvDialogProps> = ({ isOpen, onClose, remote = false, initialTv }) => {
	const tvs = useTvs(isOpen);
	const controls = useTvControls();
	const [stored, setStored] = useStoredTv(initialTv);
	const selected = defaultTv(tvs, stored);
	const tv = tvs.find((t) => t.entityId === selected);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="workspace" className="overflow-hidden">
				<DialogHeader>
					<DialogTitle>TVs</DialogTitle>
					<DialogDescription className="short:hidden">
						Turn a TV on or off, open an app or switch inputs
					</DialogDescription>
				</DialogHeader>
				{tvs.length === 0 ? (
					<EmptyState icon={<TvIcon className="size-10" />}>No TVs found in Home Assistant.</EmptyState>
				) : (
					<div className="flex min-h-0 flex-1 gap-4 max-md:flex-col">
						<TvList tvs={tvs} selected={selected} onSelect={setStored} />
						{tv && <TvPanel tv={tv} controls={controls} remote={remote} />}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

/**
 * Opens the TVs, with a count of the ones that are on. `label` adds "TV" (hidden on the narrowest
 * phones). Nothing without a TV.
 */
export const TvButton: React.FC<{
	size?: ButtonProps['size'];
	label?: boolean;
	/** A tile (the phone header's row): the label always shows, under the icon with the caller's layout. */
	tile?: boolean;
	/** Show the Remote tab (the Home dashboard only). */
	remote?: boolean;
	className?: string;
}> = ({ size = 'icon-xl', label, tile, remote, className }) => {
	const [open, setOpen] = useState(false);
	const tvs = useTvs();
	const on = tvs.filter((tv) => tv.state === 'on');
	if (tvs.length === 0) return null;
	const title = on.length === 0 ? 'TVs' : `TVs: ${on.map((tv) => `${tv.name} · ${tvStatus(tv)}`).join('; ')}`;

	return (
		<>
			<Button
				variant="secondary"
				size={size}
				onClick={() => setOpen(true)}
				aria-label={title}
				title={title}
				className={cn('relative', className)}
			>
				<TvIcon />
				{(label || tile) && <span className={cn(!tile && 'max-[520px]:sr-only')}>TV</span>}
				{on.length > 0 && <CountBadge>{on.length}</CountBadge>}
			</Button>
			<TvDialog isOpen={open} onClose={() => setOpen(false)} remote={remote} />
		</>
	);
};
