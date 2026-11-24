/**
 * The Daily dialog: the daily brief (with Play on a speaker), a person's daily affirmation, and the
 * Study tab.
 *
 * @module
 */

import {
	BookOpen,
	CalendarDays,
	Flag,
	Globe,
	Heart,
	Loader2,
	MapPin,
	Newspaper,
	Pause,
	Play,
	RefreshCw,
	Speaker,
	Square,
} from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useEntity, useHassApi, useHassSelector } from '../../context/HassContext';
import { useBusy } from '../../hooks/useBusy';
import { useNow } from '../../hooks/useNow';
import {
	affirmationEntity,
	type DailyAffirmation,
	formerAffirmationEntity,
	isAffirmationCurrent,
	toAffirmation,
} from '../../lib/affirmation';
import { isBirthdayOf } from '../../lib/birthdays';
import {
	BRIEF_PLAYBACK_WATCH,
	type BriefEvent,
	type BriefPlayback,
	type BriefStory,
	type BriefWeather,
	briefAudioFile,
	briefPosition,
	DAILY_BRIEF_ENTITY,
	type DailyBrief,
	formatBriefEventTime,
	formatBriefUpdated,
	formatWhen,
	isBriefCurrent,
	recordingPlayback,
	toDailyBrief,
} from '../../lib/brief';
import { houseConfig } from '../../lib/house-config';
import { discoverIntercomSpeakers, type IntercomSpeaker } from '../../lib/intercom';
import { formatTrackTime } from '../../lib/music';
import { householdPerson } from '../../lib/people';
import { SCRIPTURE_AUDIO_FILE } from '../../lib/scripture';
import { readStored, writeStored } from '../../lib/storage';
import { formatDegrees, formatWeatherCondition } from '../../lib/weather';
import { HolidayCharacter, HolidayPeek, useBirthdays } from '../holiday/HolidayEgg';
import { IconX } from '../Icons';
import { MusicDialog } from '../music/MusicDialog';
import { confirmTvTakeover } from '../music/TvAudioConfirm';
import { requestPlayPause, useShownState } from '../music/useMusic';
import {
	Alert,
	AlertDescription,
	Button,
	Card,
	ChipRow,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	Progress,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	toast,
	toggleVariants,
} from '../ui';
import { WeatherIcon } from '../weather/WeatherIcon';
import { BriefCard } from './BriefCard';
import { StudyView } from './StudyView';

const GENERATE_SCRIPT = 'script.daily_brief_generate';
const PLAY_SCRIPT = 'script.daily_brief_announce';
const AUDIO_SCRIPT = 'script.daily_brief_audio';
const SCRIPTURE_PLAY_SCRIPT = 'script.daily_scripture_announce';
// The speaker Play last used, per device
const SPEAKER_KEY = 'daily-brief-speaker';
// A stopped speaker can report the brief for a few seconds more (and keeps it loaded, as if paused)
const STOPPED_MS = 20_000;
// After Play, a speaker shows "Starting…" until it reports playing, for this long at most once the
// play script is done (Music Assistant can take 15s to report a new item playing)
const STARTING_MS = 30_000;

/** The latest daily brief (undefined until one has been built). */
export function useDailyBrief(): DailyBrief | undefined {
	const entity = useEntity(DAILY_BRIEF_ENTITY);
	return toDailyBrief(entity);
}

/**
 * The signed-in household member's latest daily affirmation: null for an account that isn't one
 * (the wall panels, the admin), undefined until one has been stored.
 */
export function useDailyAffirmation(): DailyAffirmation | null | undefined {
	const personId = useHassSelector(
		(hass) => (hass ? householdPerson(hass.states, hass.user?.id)?.entity_id : undefined),
		{
			watch: (id) => id.startsWith('person.'),
		},
	);
	// The integration's sensor, else the house's own helper
	const sensor = useEntity(personId ? affirmationEntity(personId) : '');
	const former = useEntity(personId ? formerAffirmationEntity(personId) : '');
	return personId ? toAffirmation(sensor ?? former) : null;
}

// Else the house's announcing speaker (the house settings)
const readSpeaker = () => readStored(SPEAKER_KEY) || houseConfig().announceSpeaker || '';

/** The brief's weather: now, big, beside the day's high, low and chance of rain. */
const WeatherSection: React.FC<{ weather?: BriefWeather }> = ({ weather }) => {
	if (!weather) {
		return (
			<Card className="justify-center gap-0 p-4">
				<span className="text-muted-foreground text-sm">No weather in this brief.</span>
			</Card>
		);
	}
	const stats = [
		{ label: 'High', value: formatDegrees(weather.high) },
		{ label: 'Low', value: formatDegrees(weather.low) },
		{ label: 'Rain', value: `${weather.precipitationProbability ?? 0}%` },
	];
	return (
		<Card className="flex-row items-center justify-between gap-4 px-4 py-3">
			<div className="flex min-w-0 items-center gap-3">
				<WeatherIcon condition={weather.condition} className="size-10 shrink-0" />
				<div className="flex min-w-0 flex-col gap-1">
					<span className="font-semibold text-3xl tabular-nums leading-none">{formatDegrees(weather.temperature)}</span>
					<span className="truncate text-muted-foreground text-sm">{formatWeatherCondition(weather.condition)}</span>
				</div>
			</div>
			<dl className="flex shrink-0 divide-x text-center">
				{stats.map((stat) => (
					<div key={stat.label} className="flex flex-col gap-0.5 px-3 last:pr-0">
						<dt className="text-muted-foreground text-xs">{stat.label}</dt>
						<dd className="font-medium tabular-nums">{stat.value}</dd>
					</div>
				))}
			</dl>
		</Card>
	);
};

/**
 * Today's calendar, a strip beside the weather: its name at the left (over the events on a phone),
 * then each event with its calendar (and where), its time at the right, side by side where they fit.
 */
const TodaySection: React.FC<{ events: BriefEvent[] }> = ({ events }) => (
	<Card className="min-w-0 gap-0 py-0 sm:flex-row sm:items-stretch">
		<div className="flex shrink-0 items-center gap-2 px-4 font-semibold max-sm:border-b max-sm:py-3 sm:border-r">
			<CalendarDays className="size-5 shrink-0 text-info" />
			Today
		</div>
		{events.length === 0 ? (
			<p className="flex items-center px-4 py-3 text-muted-foreground text-sm">Nothing on the calendar.</p>
		) : (
			// As many side by side as have room for their name and time; the outer lines are clipped away
			<div className="min-w-0 flex-1 overflow-hidden">
				<ul className="-mr-px -mb-px grid h-full grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
					{events.map((event) => (
						<li
							key={`${event.calendar}|${event.start.getTime()}|${event.summary}`}
							className="flex items-center gap-3 border-r border-b px-4 py-3"
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate font-medium">{event.summary}</span>
								<span className="truncate text-muted-foreground text-sm">
									{[event.calendar, event.location].filter(Boolean).join(' · ')}
								</span>
							</div>
							<span className="shrink-0 text-muted-foreground text-sm tabular-nums">{formatBriefEventTime(event)}</span>
						</li>
					))}
				</ul>
			</div>
		)}
	</Card>
);

/**
 * One section of the news: each story a headline over a sentence about it (a story from an older
 * brief, without a headline, is its sentence alone).
 */
const NewsSection: React.FC<{
	icon: React.ComponentType<{ className?: string }>;
	tone: string;
	title: string;
	stories: BriefStory[];
}> = ({ icon, tone, title, stories }) => (
	<BriefCard icon={icon} tone={tone} title={title}>
		{stories.length === 0 ? (
			<p className="px-4 py-3 text-muted-foreground text-sm">No stories found.</p>
		) : (
			<ul className="flex flex-col divide-y">
				{stories.map((story) => (
					<li key={`${story.headline}|${story.text}`} className="wrap-break-word flex flex-col gap-1 px-4 py-3">
						{story.headline && <span className="text-balance font-medium leading-snug">{story.headline}</span>}
						<span className={story.headline ? 'text-muted-foreground text-sm' : 'max-2xl:text-sm'}>{story.text}</span>
					</li>
				))}
			</ul>
		)}
	</BriefCard>
);

/**
 * The brief on a speaker: where, how far along, Speakers (the music dialog's, over this one, to play
 * it along on more speakers or take some off), Pause / Resume and Stop; "Starting…" from Play until
 * the speaker reports it playing (it reports a new item idle, like a pause, while it loads).
 */
const PlaybackBar: React.FC<{
	playback: BriefPlayback;
	starting: boolean;
	onStop: () => void;
	/** What's playing, for the buttons' labels: "brief", "scripture" */
	what: string;
}> = ({ playback, starting, onStop, what }) => {
	const { callService } = useHassApi();
	// A pause or resume just tapped shows at once (here and in the music player) until it's reported
	const state = useShownState(playback.entityId, playback.state);
	const playing = state === 'playing';
	const now = useNow(playing);
	const position = briefPosition({ ...playback, state: playing ? 'playing' : 'paused' }, now);
	const duration = playback.duration;
	const [speakersOpen, setSpeakersOpen] = useState(false);

	return (
		<div className="flex shrink-0 items-center gap-3 rounded-lg border bg-card p-2 pl-3">
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="flex items-baseline gap-2 text-sm">
					<span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium">
						{starting && !playing && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
						<span className="truncate">
							{starting && !playing ? 'Starting' : playing ? 'Playing' : 'Paused'} on {playback.name}
							{starting && !playing ? '…' : ''}
						</span>
					</span>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{formatTrackTime(position)}
						{duration ? ` / ${formatTrackTime(duration)}` : ''}
					</span>
				</div>
				<Progress
					value={duration ? (position / duration) * 100 : 0}
					className="h-1"
					aria-label={`Progress of the ${what}`}
				/>
			</div>
			<Button
				variant="outline"
				size="icon-lg"
				onClick={() => setSpeakersOpen(true)}
				aria-label={`Speakers playing the ${what}`}
				title="Speakers"
			>
				<Speaker />
			</Button>
			<MusicDialog
				isOpen={speakersOpen}
				onClose={() => setSpeakersOpen(false)}
				initialPlayer={playback.entityId}
				initialTab="speakers"
			/>
			<Button
				variant="outline"
				size="icon-lg"
				onClick={() => requestPlayPause(callService, playback.entityId, !playing)}
				disabled={starting && !playing}
				aria-label={playing ? `Pause the ${what}` : `Resume the ${what}`}
				title={playing ? 'Pause' : 'Resume'}
			>
				{playing ? <Pause /> : <Play className="translate-x-px" />}
			</Button>
			<Button variant="outline" size="icon-lg" onClick={onStop} aria-label={`Stop the ${what}`} title="Stop">
				<Square className="scale-90 fill-current" />
			</Button>
		</div>
	);
};

const without = (record: Record<string, number>, id: string) => {
	if (!(id in record)) return record;
	const next = { ...record };
	delete next[id];
	return next;
};

/**
 * A recording the dialog plays (the brief's, the scripture's) on the speakers: the speakers that
 * have it loaded (`recordingPlayback()`, matched by `file`), "Starting…" from Play until a speaker
 * reports it playing (or a while after the play script is done), and Stop, hidden at once while
 * the speaker still reports it.
 */
function useRecordingPlayback(
	file: string | undefined,
	duration: number | undefined,
	playScript: string,
	speakers: IntercomSpeaker[],
	/** The dialog is open: closed (it stays mounted), no speaker is scanned. */
	enabled: boolean,
) {
	const { callService } = useHassApi();
	const running = useEntity(playScript)?.state === 'on';
	const loaded = useHassSelector((hass) => (enabled && hass ? recordingPlayback(hass.states, file, duration) : []), {
		watch: BRIEF_PLAYBACK_WATCH,
	});
	// Speakers just stopped (epoch ms), hidden while they still report the recording
	const [stopped, setStopped] = useState<Record<string, number>>({});
	// Speakers Play was just sent to (epoch ms), "Starting…" until they report it playing
	const [startedAt, setStartedAt] = useState<Record<string, number>>({});

	// "Starting…" runs out on time: one re-render when the first one does, not one a second for the
	// whole dialog
	const [tick, setTick] = useState(() => Date.now());
	useEffect(() => {
		const times = Object.values(startedAt);
		if (times.length === 0) return;
		const timer = setTimeout(() => setTick(Date.now()), Math.max(0, Math.min(...times) + STARTING_MS - Date.now()));
		return () => clearTimeout(timer);
	}, [startedAt]);
	const isStarting = (id: string) => {
		const at = startedAt[id];
		return at !== undefined && (running || tick - at < STARTING_MS);
	};
	const playingIds = loaded.filter((p) => p.state === 'playing').map((p) => p.entityId);
	useEffect(() => {
		setStartedAt((current) => {
			let next = current;
			for (const id of Object.keys(current)) {
				if (playingIds.includes(id) || (!running && Date.now() - current[id] >= STARTING_MS)) next = without(next, id);
			}
			return next;
		});
	}, [playingIds.join('|'), running, tick]);

	const playbacks: BriefPlayback[] = loaded.filter((p) => {
		const at = stopped[p.entityId];
		return at === undefined || (p.state === 'playing' && Date.now() - at > STOPPED_MS);
	});
	// A speaker still loading the recording may report what it had before: show it starting anyway
	for (const id of Object.keys(startedAt)) {
		if (!isStarting(id) || playbacks.some((p) => p.entityId === id)) continue;
		const s = speakers.find((sp) => sp.entityId === id);
		playbacks.push({ entityId: id, name: s?.name ?? id, state: 'paused', duration });
	}

	return {
		playbacks,
		isStarting,
		/** Play was just sent to the speaker */
		begin: (id: string) => {
			setStopped((current) => without(current, id));
			setStartedAt((current) => ({ ...current, [id]: Date.now() }));
		},
		/** Play didn't reach it */
		cancel: (id: string) => setStartedAt((current) => without(current, id)),
		stop: (p: BriefPlayback) => {
			setStartedAt((current) => without(current, p.entityId));
			setStopped((current) => ({ ...current, [p.entityId]: Date.now() }));
			callService('media_player', 'media_stop', { entity_id: p.entityId });
		},
	};
}

/** Whether today is the signed-in household member's birthday (the Birthdays calendar). */
function useMemberBirthday(): boolean {
	const name = useHassSelector(
		(hass) => (hass ? householdPerson(hass.states, hass.user?.id)?.attributes.friendly_name : undefined),
		{ watch: (id) => id.startsWith('person.') },
	);
	const birthdays = useBirthdays();
	return isBirthdayOf(birthdays, typeof name === 'string' ? name : undefined);
}

const AffirmationView: React.FC<{ affirmation?: DailyAffirmation; now: Date; birthday: boolean }> = ({
	affirmation,
	now,
	birthday,
}) =>
	affirmation ? (
		<div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
			{/* The words fill the tab, centered: they're all there is to read here */}
			<Card className="min-h-min flex-1 items-center justify-center gap-0 px-6 py-10 short:py-6 text-center">
				<figure className="flex max-w-3xl flex-col items-center gap-6 short:gap-3">
					{/* On their birthday (this morning's opens with a happy birthday), the cupcake */}
					{birthday ? (
						<HolidayCharacter id="birthday" animated className="size-12" />
					) : (
						<span className="flex size-12 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
							<Heart className="size-6" />
						</span>
					)}
					<blockquote className="wrap-break-word text-balance font-medium text-2xl leading-snug sm:text-3xl xl:text-4xl xl:leading-tight">
						{affirmation.text}
					</blockquote>
					<figcaption className="text-muted-foreground text-sm">{formatWhen(affirmation.at, now)}</figcaption>
				</figure>
			</Card>
		</div>
	) : (
		<EmptyState icon={<HolidayPeek className="size-10" fallback={<Heart className="size-10" />} />}>
			No affirmation yet. A new one arrives every morning at 7.
		</EmptyState>
	);

/** The Daily dialog's tabs. */
export type DailyBriefTab = 'brief' | 'affirmation' | 'study';

/** {@link DailyBriefDialog}'s props. */
export interface DailyBriefDialogProps {
	/** Whether the dialog is open. */
	isOpen: boolean;
	/** Called when it's dismissed. */
	onClose: () => void;
	/** The tab it opens on (the affirmation notification's link opens `affirmation`); the brief by default. */
	tab?: DailyBriefTab;
}

/**
 * The daily brief (built at 7 AM: weather, today's calendar, local, national and world news, what's trending on X), with
 * Play on a picked speaker (remembered per device: the brief's recording, with Pause /
 * Resume and Stop while it plays) and Refresh to build it again; a Study tab with today's scripture
 * and this week's Come, Follow Me lesson (`StudyView`). A household member signed in also gets a
 * Daily Affirmation tab: their own latest one (`useDailyAffirmation()`).
 */
export const DailyBriefDialog: React.FC<DailyBriefDialogProps> = ({ isOpen, onClose, tab: openTab = 'brief' }) => {
	const { callService, waitFor } = useHassApi();
	const brief = useDailyBrief();
	const busy = useBusy();
	const generating = useEntity(GENERATE_SCRIPT)?.state === 'on';
	const starting = useEntity(PLAY_SCRIPT)?.state === 'on';
	const recording = useEntity(AUDIO_SCRIPT)?.state === 'on';
	const startingScripture = useEntity(SCRIPTURE_PLAY_SCRIPT)?.state === 'on';
	const audio = brief?.audio;
	const speakers = useHassSelector((hass) => (isOpen && hass ? discoverIntercomSpeakers(hass.states, hass) : []), {
		watch: ['media_player'],
	});
	const briefAudio = useRecordingPlayback(
		audio && briefAudioFile(audio.url),
		audio?.duration,
		PLAY_SCRIPT,
		speakers,
		isOpen,
	);
	const scriptureAudio = useRecordingPlayback(SCRIPTURE_AUDIO_FILE, undefined, SCRIPTURE_PLAY_SCRIPT, speakers, isOpen);
	const [speaker, setSpeaker] = useState(readSpeaker);
	const [now, setNow] = useState(() => new Date());
	const affirmation = useDailyAffirmation();
	const birthday = useMemberBirthday();
	const [tab, setTab] = useState<DailyBriefTab>(openTab);
	// The wall panels (no household member signed in) have no affirmation
	const shown = affirmation === null && tab === 'affirmation' ? 'brief' : tab;

	useEffect(() => {
		if (isOpen) {
			setNow(new Date());
			setTab(openTab);
		}
	}, [isOpen, openTab]);

	const available = speakers.filter((s) => s.available);
	// The remembered speaker while it's around, else the first one that is
	const target = available.find((s) => s.entityId === speaker) ?? available[0];

	const pickSpeaker = (entityId: string) => {
		setSpeaker(entityId);
		writeStored(SPEAKER_KEY, entityId);
	};

	// Both scripts run for a while; their buttons stay busy until each reports it's running, then
	// while it runs
	const start = (key: string, script: string, variables?: Record<string, unknown>) =>
		busy.run(key, async () => {
			// The caller reports a failure (its own toast, at once rather than after the wait)
			const data = variables ? { entity_id: script, variables } : { entity_id: script };
			const sent = await callService('script', 'turn_on', data, { errors: 'throw' }).then(
				() => true,
				() => false,
			);
			return sent && waitFor((hass) => hass.states[script]?.state === 'on');
		});

	const play = async () => {
		if (!target) return;
		if (target.tvAudio && !(await confirmTvTakeover(target.name))) return;
		const id = target.entityId;
		briefAudio.begin(id);
		const started = await start('play', PLAY_SCRIPT, { target_speakers: [id] });
		if (!started) {
			briefAudio.cancel(id);
			toast.error("Couldn't play the brief", { description: target.name });
		}
	};

	const refresh = async () => {
		const started = await start('refresh', GENERATE_SCRIPT);
		if (!started) toast.error("Couldn't refresh the brief");
	};

	const playScripture = async () => {
		if (!target) return;
		if (target.tvAudio && !(await confirmTvTakeover(target.name))) return;
		const id = target.entityId;
		scriptureAudio.begin(id);
		const started = await start('scripture', SCRIPTURE_PLAY_SCRIPT, { target_speakers: [id] });
		if (!started) {
			scriptureAudio.cancel(id);
			toast.error("Couldn't play today's scripture", { description: target.name });
		}
	};

	// The speakers both tabs play on (one pick, remembered per device), labeled at their left (above
	// them on a phone)
	const playOn = (
		<div className="flex min-w-0 grow basis-64 items-center gap-3 max-sm:basis-full max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
			<span className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Play on</span>
			<ChipRow role="group" aria-label="Play on" className="min-w-0 flex-1">
				{available.map((s) => {
					const isOn = s.entityId === target?.entityId;
					return (
						<button
							key={s.entityId}
							type="button"
							aria-pressed={isOn}
							data-state={isOn ? 'on' : 'off'}
							onClick={() => pickSpeaker(s.entityId)}
							className={toggleVariants({ variant: 'outline', size: 'xl' })}
						>
							{s.name}
						</button>
					);
				})}
			</ChipRow>
		</div>
	);

	const refreshing = generating || busy.isBusy('refresh');
	const current = brief && isBriefCurrent(brief, now);

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			<DialogContent size="workspace" showCloseButton={false}>
				<Tabs
					value={shown}
					onValueChange={(value) => setTab(value as DailyBriefTab)}
					className="flex min-h-0 flex-1 flex-col gap-4 short:gap-2"
				>
					{/* One row inside the dialog's padding: the title, the tabs and the close button, centered on
					    one line and ending at the content's edge (on phones the tabs take a row of their own) */}
					<DialogHeader className="shrink-0 flex-row flex-wrap items-center gap-3 text-left max-sm:px-0 sm:pr-0 touch:sm:pr-0">
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<DialogTitle>Daily</DialogTitle>
							<DialogDescription className="short:hidden">
								{shown === 'study'
									? "Today's scripture and this week's Come, Follow Me lesson"
									: shown === 'affirmation'
										? affirmation
											? isAffirmationCurrent(affirmation, now)
												? birthday
													? 'Happy birthday! Your affirmation for today'
													: 'Your affirmation for today'
												: `Your affirmation from ${formatWhen(affirmation.at, now)}`
											: 'A new affirmation every morning'
										: brief
											? `${brief.date} · Updated ${formatBriefUpdated(brief, now)}`
											: 'Weather, calendar and news'}
							</DialogDescription>
						</div>
						<TabsList className="h-11 shrink-0 max-sm:order-last max-sm:w-full sm:w-fit">
							<TabsTrigger value="brief" className="px-4">
								<Newspaper />
								Brief
							</TabsTrigger>
							{affirmation !== null && (
								<TabsTrigger value="affirmation" className="px-4">
									<Heart />
									Affirmation
								</TabsTrigger>
							)}
							<TabsTrigger value="study" className="px-4">
								<BookOpen />
								Study
							</TabsTrigger>
						</TabsList>
						<DialogClose />
					</DialogHeader>

					<TabsContent value="affirmation" className="flex min-h-0 flex-col">
						<AffirmationView affirmation={affirmation ?? undefined} now={now} birthday={birthday} />
					</TabsContent>

					<TabsContent value="study" className="flex min-h-0 flex-col">
						<StudyView
							active={isOpen}
							playOn={playOn}
							onPlay={playScripture}
							playing={startingScripture || busy.isBusy('scripture')}
							canPlay={!!target}
							playback={scriptureAudio.playbacks.map((p) => (
								<PlaybackBar
									key={p.entityId}
									playback={p}
									starting={scriptureAudio.isStarting(p.entityId)}
									onStop={() => scriptureAudio.stop(p)}
									what="scripture"
								/>
							))}
						/>
					</TabsContent>

					<TabsContent value="brief" className="flex min-h-0 flex-col gap-4 short:gap-2">
						{brief && !current && (
							<Alert variant="warning" className="shrink-0">
								<AlertDescription>
									This brief is from {formatBriefUpdated(brief, now)}. Refresh for today's.
								</AlertDescription>
							</Alert>
						)}
						{brief ? (
							// The day (weather, calendar) in a strip over the news, which takes the height that's
							// left; it all scrolls together when it needs more
							<div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
								<div className="grid shrink-0 gap-3 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
									<WeatherSection weather={brief.weather} />
									<TodaySection events={brief.events} />
								</div>
								<div className="grid min-h-min shrink-0 gap-3 sm:grid-cols-2 xl:flex-1 xl:grid-cols-4">
									<NewsSection
										icon={MapPin}
										tone="text-emerald-600 dark:text-emerald-400"
										title="Local"
										stories={brief.news.local}
									/>
									<NewsSection
										icon={Flag}
										tone="text-sky-600 dark:text-sky-400"
										title="National"
										stories={brief.news.national}
									/>
									<NewsSection
										icon={Globe}
										tone="text-violet-600 dark:text-violet-400"
										title="World"
										stories={brief.news.world}
									/>
									<NewsSection
										icon={IconX}
										tone="size-4.5 text-foreground"
										title="Trending"
										stories={brief.news.trending}
									/>
								</div>
							</div>
						) : (
							<EmptyState icon={<HolidayPeek className="size-10" fallback={<Newspaper className="size-10" />} />}>
								{refreshing ? 'Putting together the brief…' : 'No brief yet. It arrives every morning at 7.'}
							</EmptyState>
						)}

						{briefAudio.playbacks.map((p) => (
							<PlaybackBar
								key={p.entityId}
								playback={p}
								starting={briefAudio.isStarting(p.entityId)}
								onStop={() => briefAudio.stop(p)}
								what="brief"
							/>
						))}

						{/* On a phone's full-screen dialog the actions sit at the bottom edge */}
						<div className="mt-auto flex shrink-0 flex-wrap items-center gap-2 border-t pt-3">
							{brief && playOn}
							{/* On phones the buttons share the dialog's full width */}
							<div className="ml-auto flex gap-2 max-sm:w-full max-sm:*:flex-1">
								<Button variant="outline" size="xl" onClick={refresh} loading={refreshing}>
									<RefreshCw />
									{brief ? 'Refresh' : 'Create brief'}
								</Button>
								{brief && (
									<Button
										size="xl"
										onClick={play}
										loading={starting || busy.isBusy('play')}
										disabled={!target}
										title={recording || (starting && !audio) ? 'Recording the brief…' : undefined}
									>
										<Play />
										Play
									</Button>
								)}
							</div>
						</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
