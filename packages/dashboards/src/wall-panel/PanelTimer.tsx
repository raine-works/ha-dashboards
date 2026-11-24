/**
 * The wall panel's kitchen timer: a header button with the live countdown, its dialog, and the
 * announcement when it's done (on the house's announcing speaker, else the panel's own chime).
 */

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Progress,
	toast,
} from '@app/ui/components';
import { useHassApi } from '@app/ui/hass';
import { houseConfig } from '@app/ui/lib/house-config';
import { broadcastText } from '@app/ui/lib/intercom';
import { readStored, writeStored } from '@app/ui/lib/storage';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import {
	addMinutes,
	formatClock,
	hasFinished,
	IDLE_TIMER,
	isRunning,
	restoreTimer,
	secondsLeft,
	storeTimer,
	type TimerState,
	timerDoneMessage,
	togglePause,
} from './timer';

const PRESET_MINUTES = [1, 3, 5, 10, 15];
const ANNOUNCE_VOLUME = 80;
/** The running or paused timer on this device, so a reload (a deploy, the nightly one) keeps it. */
// Named when it was the kitchen panel's own (kept, so a timer running across this change survives)
const STORAGE_KEY = 'ha-dashboards:kitchen-timer';

const readStoredTimer = () => restoreTimer(readStored(STORAGE_KEY), Date.now());

function writeStoredTimer(state: TimerState) {
	// Storage off: the timer still runs, just not across a reload
	writeStored(STORAGE_KEY, storeTimer(state));
}

function playChime(contextRef: { current: AudioContext | null }) {
	try {
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) return;
		contextRef.current ??= new AudioCtx();
		const ctx = contextRef.current;
		if (ctx.state === 'suspended') ctx.resume();

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(880, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.8);
		gain.gain.setValueAtTime(0.3, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + 0.8);
	} catch (err) {
		console.warn('Audio chime unsupported or blocked', err);
	}
}

/** The panel timer as the header and its dialog see it (`usePanelTimer`). */
export interface PanelTimerControls {
	/** Whole seconds left. */
	seconds: number;
	/** Counting down (not paused). */
	running: boolean;
	/** A countdown exists (running or paused). */
	active: boolean;
	/** Percent of the total still left, for the progress bar. */
	progress: number;
	/** Add minutes and (re)start it. */
	add: (minutes: number) => void;
	/** Pause or resume. */
	toggle: () => void;
	/** Clear it. */
	reset: () => void;
}

/**
 * The panel timer's state, owned by the header so it keeps running (and announces, with a toast)
 * while its dialog is closed, and kept in the device's storage so it survives the panel reloading.
 */
export function usePanelTimer(): PanelTimerControls {
	const { getHass } = useHassApi();
	// Picks up where the panel left off before a reload (one that ended meanwhile announces at once)
	const [state, setState] = useState<TimerState>(readStoredTimer);
	const [now, setNow] = useState(() => Date.now());
	const audioRef = useRef<AudioContext | null>(null);
	const running = isRunning(state);

	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(timer);
	}, [running]);

	useEffect(() => writeStoredTimer(state), [state]);

	useEffect(() => {
		if (!hasFinished(state, now)) return;
		setState(IDLE_TIMER);
		// Announced on the house's announcing speaker (script.play_announcement: pre-announce chime, then the house's voice),
		// which carries across the room; the panel's own chime when the speaker is down or the call fails
		const current = getHass();
		// Where "the timer is done" is announced: the house's announcing speaker (the house settings)
		const { announceSpeaker } = houseConfig();
		const speaker = announceSpeaker && current?.states[announceSpeaker]?.state;
		if (current && announceSpeaker && speaker && speaker !== 'unavailable' && speaker !== 'unknown') {
			broadcastText(current, timerDoneMessage(state.totalMs), {
				speakers: [announceSpeaker],
				volume: ANNOUNCE_VOLUME,
				chime: true,
			}).catch(() => playChime(audioRef));
		} else {
			playChime(audioRef);
		}
		toast.success('Timer done', { description: 'Your timer has finished', duration: 15_000 });
	}, [state, now]);

	const seconds = secondsLeft(state, now);
	return {
		seconds,
		running,
		active: seconds > 0,
		progress: state.totalMs > 0 ? (seconds * 1000 * 100) / state.totalMs : 0,
		add: (minutes) => {
			const at = Date.now();
			setNow(at);
			setState((prev) => addMinutes(prev, minutes, at));
		},
		toggle: () => {
			const at = Date.now();
			setNow(at);
			setState((prev) => togglePause(prev, at));
		},
		reset: () => setState(IDLE_TIMER),
	};
}

/** `PanelTimerDialog`'s props: the header's timer, and whether the dialog is open. */
export interface PanelTimerDialogProps {
	timer: PanelTimerControls;
	isOpen: boolean;
	onClose: () => void;
}

/** The timer's dialog: the countdown, presets to add minutes, pause and reset. */
export const PanelTimerDialog: React.FC<PanelTimerDialogProps> = ({ timer, isOpen, onClose }) => (
	<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Timer</DialogTitle>
				<DialogDescription>
					{timer.active ? (timer.running ? 'Running' : 'Paused') : 'Tap a preset to start'}
				</DialogDescription>
			</DialogHeader>

			<div className="flex flex-col gap-3 py-2">
				<div
					className={`text-center font-mono font-semibold text-6xl tabular-nums ${timer.active ? '' : 'text-muted-foreground'}`}
				>
					{formatClock(timer.seconds)}
				</div>
				<Progress value={timer.progress} />
			</div>

			{/* Rows the buttons share, never narrower than their content (equal columns squeezed "+10m") */}
			<div className="flex gap-2 *:flex-1">
				{PRESET_MINUTES.map((minutes) => (
					<Button key={minutes} variant="secondary" size="xl" onClick={() => timer.add(minutes)}>
						+{minutes}m
					</Button>
				))}
			</div>

			{timer.active && (
				<div className="flex gap-2 *:flex-1">
					<Button size="xl" onClick={timer.toggle}>
						{timer.running ? <Pause /> : <Play />}
						{timer.running ? 'Pause' : 'Resume'}
					</Button>
					<Button variant="outline" size="xl" onClick={timer.reset}>
						<RotateCcw />
						Reset
					</Button>
				</div>
			)}
		</DialogContent>
	</Dialog>
);

/** Header button with the live countdown, plus its dialog. Owns the timer so it survives the dialog closing. */
export const PanelTimerAction: React.FC = () => {
	const timer = usePanelTimer();
	const [isOpen, setIsOpen] = useState(false);
	return (
		<>
			<Button variant="outline" size="tile" onClick={() => setIsOpen(true)} className="min-w-16">
				<Timer />
				{/* Live countdown while a timer is set */}
				<span className={timer.active ? 'font-mono tabular-nums' : undefined}>
					{timer.active ? formatClock(timer.seconds) : 'Timer'}
				</span>
			</Button>
			<PanelTimerDialog timer={timer} isOpen={isOpen} onClose={() => setIsOpen(false)} />
		</>
	);
};
