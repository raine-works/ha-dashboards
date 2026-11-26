/**
 * Assist on the dashboards: the button that starts a run, and the overlay that shows it (listening,
 * thinking, the answer, and a text box for a follow-up).
 *
 * @module
 */

import { AlertCircle, ArrowUp, Keyboard, Mic, Sparkles, X } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState, useSyncExternalStore } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { type AssistPhase, type AssistState, assistStatus } from '../../lib/assist';
import { cn } from '../../lib/utils';
import { PlayingBars } from '../music/Artwork';
import { Button, type ButtonProps, Input, Markdown } from '../ui';
import {
	askAssist,
	assistStore,
	cancelAssist,
	keepAssistCard,
	startAssist,
	startTyping,
	stopListening,
	subscribeAssistLevel,
} from './assistSession';

/** The page's Assist run (one at a time), re-rendering only when it changes. */
export function useAssist(): AssistState {
	return useSyncExternalStore(assistStore.subscribe, assistStore.get);
}

/** Phases with a run in progress (the button stops it; the screen glows). */
const RUNNING: AssistPhase[] = ['starting', 'listening', 'processing', 'speaking'];

/** How long the card takes to slide away (`assist-card-out` in theme.css). */
const EXIT_MS = 220;

/**
 * Talk to Home Assistant: a tap listens for a command, runs it through the preferred Assist
 * pipeline (which performs it) and speaks the answer. The one header button in color (Button's
 * `assist` variant), its sparkles twinkling now and then, filled while a run is in progress. While
 * the card is up, the overlay takes every tap (anywhere closes it), so only the keyboard reaches
 * the button then: pressed while it listens it ends the command; while it thinks or speaks, cancels.
 * `round`: a circle (the phone's tab bar).
 */
export const AssistButton: React.FC<{ size?: ButtonProps['size']; round?: boolean; className?: string }> = ({
	size = 'icon-xl',
	round,
	className,
}) => {
	const { getHass } = useHassApi();
	const { phase } = useAssist();
	const active = RUNNING.includes(phase);

	const onClick = () => {
		if (phase === 'listening' || phase === 'starting') stopListening();
		else if (active) cancelAssist();
		else {
			const hass = getHass();
			if (hass) void startAssist(hass);
		}
	};

	return (
		<Button
			variant="assist"
			size={size}
			onClick={onClick}
			aria-pressed={active}
			aria-label={phase === 'listening' ? 'Done talking' : active ? 'Stop Assist' : 'Assist'}
			title={phase === 'listening' ? 'Done talking' : active ? 'Stop Assist' : 'Assist'}
			data-shape={round ? 'round' : undefined}
			className={className}
		>
			<Sparkles className={cn('size-5', !active && 'assist-twinkle')} />
			{size === 'tile' && <span>Assist</span>}
		</Button>
	);
};

/** The microphone's level as `--assist-level` (0–1) on the overlay: its orb, meter and glow follow it in CSS. */
function setLevelVar(el: HTMLElement, level: number) {
	el.style.setProperty('--assist-level', level.toFixed(3));
}

/**
 * How much of the window the on-screen keyboard covers, as `--assist-keyboard` on the overlay, so
 * the card sits above it: an iPhone's keyboard draws over the page without resizing it (0 where
 * the window shrinks instead, as on Android and the wall panels).
 */
function setKeyboardVar(el: HTMLElement, inset: number) {
	el.style.setProperty('--assist-keyboard', `${Math.round(inset)}px`);
}

/** Put the cursor in the text box (a module function: the compiler skips components that change an element in state). */
function focusField(el: HTMLElement) {
	el.focus({ preventScroll: true });
}

// The meter's bars: how far each rises with the voice, the middle ones most
const METER_GAINS = [0.45, 0.7, 0.82, 0.6, 0.4];

/** While it listens: bars rising and falling with the voice (dots in a quiet room). */
const VoiceMeter: React.FC = () => (
	<span aria-hidden className="assist-meter text-primary">
		{METER_GAINS.map((gain, i) => (
			<span key={gain} style={{ '--gain': gain, '--i': i } as React.CSSProperties} />
		))}
	</span>
);

/**
 * A part of the card that grows open when its content arrives (a grid row from 0fr to 1fr), so the
 * card's height glides instead of jumping. Always mounted: the row needs a closed state to grow from.
 */
const Reveal: React.FC<{ open: boolean; children?: React.ReactNode }> = ({ open, children }) => (
	<div
		className={cn(
			'grid shrink-0 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
			open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
		)}
	>
		<div className="min-h-0 overflow-hidden">{children}</div>
	</div>
);

/** The orb's content: a mic while it listens, a keyboard for a typed message, sparkles while it thinks (and after), bars while it speaks. */
const OrbIcon: React.FC<{ phase: AssistPhase }> = ({ phase }) => {
	if (phase === 'speaking') return <PlayingBars />;
	if (phase === 'typing') return <Keyboard className="size-5" />;
	if (phase === 'error') return <AlertCircle className="size-5" />;
	if (phase === 'starting' || phase === 'listening') return <Mic className="size-5" />;
	return <Sparkles className={cn('size-5', phase === 'processing' && 'animate-pulse')} />;
};

/**
 * While Assist runs: the bottom of the screen glows in moving AI colors (calm while listening and
 * swelling with the voice, quicker while thinking, steady while speaking) under a card: a pill
 * ringed in the same colors, turning, with an orb (growing with the voice, rippling), what it's
 * doing and a meter of the voice; what it heard and its answer (Markdown, scrolling inside when
 * long) grow out of it. Everything moves into place: the card springs up and slides away, each
 * status rolls in, the orb's icon pops. A tap anywhere outside the card closes it, like its X,
 * whether it's running, showing its answer or an error. The answer (like an error) stays up 30
 * seconds after it's spoken, without the glow or the turning ring, and again whenever the card is
 * touched, with a mic button on the card to ask a follow-up in the same conversation (or to try
 * again after an error).
 *
 * **Typing:** a keyboard button on the card (while it listens, and beside the mic after an answer
 * or an error) opens a text box at its bottom edge instead: the message goes to the same agent in
 * the same conversation, its answer is shown and not read aloud, and the box stays for the next
 * one; the mic button goes back to speaking. Mounted once per panel by `definePanelElement`,
 * above dialogs.
 */
export const AssistOverlay: React.FC = () => {
	const state = useAssist();
	const { getHass } = useHassApi();
	const idle = state.phase === 'idle';
	// The run last shown, kept on screen while the card slides away
	const [kept, setKept] = useState<AssistState | null>(null);
	useEffect(() => {
		if (!idle) {
			setKept(state);
			return;
		}
		const timer = setTimeout(() => setKept(null), EXIT_MS);
		return () => clearTimeout(timer);
	}, [state, idle]);

	// The voice's level goes straight to a CSS variable (several times a second: never a render)
	const [root, setRoot] = useState<HTMLElement | null>(null);
	useEffect(() => {
		if (!root) return;
		return subscribeAssistLevel((level) => setLevelVar(root, level));
	}, [root]);

	const view = idle ? kept : state;
	const typed = !!view?.typed;
	// A typed message's text, until it's sent (or the card closes)
	const [draft, setDraft] = useState('');
	useEffect(() => {
		if (idle) setDraft('');
	}, [idle]);
	// The cursor goes into the text box as it appears; it stays mounted (and focused, the keyboard
	// up) from one typed message to the next
	const [field, setField] = useState<HTMLInputElement | null>(null);
	useEffect(() => {
		if (field) focusField(field);
	}, [field]);
	// Keep the card above an on-screen keyboard that covers the page (several times as it opens: never a render)
	useEffect(() => {
		const viewport = window.visualViewport;
		if (!root || !typed || !viewport) return;
		const update = () => setKeyboardVar(root, Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
		update();
		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);
		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
			setKeyboardVar(root, 0);
		};
	}, [root, typed]);

	if (!view) return null;
	const leaving = idle || undefined;
	const listening = view.phase === 'listening' || view.phase === 'starting';
	const error = view.phase === 'error';
	const typing = view.phase === 'typing';
	// Shown as it's written, before it's spoken
	const answer = listening || error ? undefined : view.response;
	const heard = listening ? undefined : view.transcript;
	// Starting and listening look the same, so nothing replays between them
	const step = listening ? 'listening' : view.phase;

	const speak = () => {
		const hass = getHass();
		if (hass) void startAssist(hass, view.conversationId);
	};
	const send = (event: Event) => {
		event.preventDefault();
		const hass = getHass();
		const text = draft.trim();
		if (!hass || !text || view.phase === 'processing') return;
		setDraft('');
		void askAssist(hass, text, view.conversationId);
	};

	return (
		<div ref={setRoot} className="contents">
			{/* While the card is up (a run, its answer or an error) a tap anywhere but the card closes it
			    and does nothing else; the card's X does the same for a keyboard */}
			{!leaving && <div className="fixed inset-0 z-60 touch-none" onClick={cancelAssist} aria-hidden="true" />}
			<div className="assist-glow" data-phase={view.phase} data-leaving={leaving} aria-hidden="true" />
			<div
				role="status"
				aria-live="polite"
				className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--assist-keyboard,0px)+1.5rem)] z-60 flex justify-center px-4 max-md:bottom-[max(calc(var(--assist-keyboard,0px)+0.75rem),calc(env(safe-area-inset-bottom)+5.5rem))]"
			>
				<div
					onPointerDown={keepAssistCard}
					onWheel={keepAssistCard}
					onInput={keepAssistCard}
					data-phase={view.phase}
					data-leaving={leaving}
					className={cn(
						'assist-card w-full',
						leaving ? 'pointer-events-none' : 'pointer-events-auto',
						answer ? 'max-w-2xl' : 'max-w-md',
					)}
				>
					<div className="flex flex-col overflow-hidden rounded-[calc(2rem-2px)] bg-popover text-popover-foreground">
						{/* What it's doing; X stops it (or closes the answer) */}
						<div className="flex shrink-0 items-center gap-3 p-2.5">
							<span className="assist-orb">
								<span key={step} className="assist-pop flex">
									<OrbIcon phase={view.phase} />
								</span>
							</span>
							<span
								key={step}
								className={cn('assist-rise min-w-0 flex-1 truncate font-medium', error && 'text-destructive')}
							>
								{assistStatus(view)}
							</span>
							{listening && <VoiceMeter />}
							{/* Type the message instead (or the follow-up): opens the text box at the card's bottom edge */}
							{!leaving && !typed && (listening || view.phase === 'answered' || error) && (
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={startTyping}
									aria-label="Type a message"
									title="Type a message"
									className="shrink-0"
								>
									<Keyboard />
								</Button>
							)}
							{/* Ask again from the card (the header's button is under the tap-to-close layer): a
							    follow-up in the same conversation after an answer, another try after an error; from
							    the text box, back to speaking */}
							{!leaving && (view.phase === 'answered' || error || typing) && (
								<Button
									variant="assist"
									size="icon-sm"
									data-shape="round"
									onClick={speak}
									aria-label={typed ? 'Speak instead' : error ? 'Try again' : 'Ask a follow-up'}
									title={typed ? 'Speak instead' : error ? 'Try again' : 'Ask a follow-up'}
									className="assist-pop shrink-0"
								>
									<Mic />
								</Button>
							)}
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={cancelAssist}
								aria-label={view.phase === 'answered' || error ? 'Close' : 'Stop Assist'}
								className="shrink-0"
							>
								<X />
							</Button>
						</div>

						<Reveal open={!!heard}>
							{heard && (
								<p className="assist-rise line-clamp-2 pr-5 pb-3 pl-15.5 text-muted-foreground text-sm">“{heard}”</p>
							)}
						</Reveal>

						<Reveal open={!!answer}>
							{answer && (
								<div className="max-h-[calc(var(--panel-height)*0.55-7rem)] short:max-h-24 overflow-y-auto overscroll-contain border-t px-5 py-4">
									<Markdown text={answer} className="assist-rise text-base leading-relaxed" />
								</div>
							)}
						</Reveal>

						{/* A typed message: Enter or the arrow sends it; it stays for the next one */}
						<Reveal open={typed}>
							{typed && (
								<form onSubmit={send} className="flex items-center gap-2 border-t px-4 py-3">
									<Input
										ref={setField}
										value={draft}
										onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
										onKeyDown={(e) => e.key === 'Escape' && cancelAssist()}
										placeholder={answer ? 'Ask a follow-up…' : 'Type a message…'}
										aria-label="Message"
										enterKeyHint="send"
										autoComplete="off"
										className="h-12 flex-1 text-base md:text-base"
									/>
									<Button
										type="submit"
										variant="assist"
										size="icon-xl"
										data-shape="round"
										disabled={!draft.trim() || view.phase === 'processing'}
										aria-label="Send"
										className="shrink-0"
									>
										<ArrowUp />
									</Button>
								</form>
							)}
						</Reveal>
					</div>
				</div>
			</div>
		</div>
	);
};
