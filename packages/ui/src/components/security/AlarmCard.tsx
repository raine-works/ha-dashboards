/**
 * The alarm card (Alarmo): its status, the exit and entry countdowns, and arming and disarming.
 *
 * @module
 */

import { Loader2, Shield, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import { useEntity, useHassApi, useHassConnection, useHassSelector } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { useWallPanelName } from '../../context/WallPanel';
import { discoverOpenings, ALARM_MODE_LABELS as MODE_LABELS, openingsWatch, sensorName } from '../../lib/alerts';
import { countdownBeep, findAlarmPanel } from '../../lib/security';
import { nameList } from '../../lib/text';
import { playBeeps, unlockAudio } from '../../lib/tones';
import { cn } from '../../lib/utils';
import { formatDuration } from '../../lib/wav';
import type { HassEntity } from '../../types/homeassistant';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '../ui';
import { KeypadModal } from './KeypadModal';

// How long to show "Arming..." while waiting for Alarmo to acknowledge the request
const REQUEST_TIMEOUT_MS = 8000;
// A refused arm's Dismiss / Arm anyway (and the PIN it keeps) goes after this, so nobody at an
// unattended panel can force-arm later without the PIN
const BLOCKED_MS = 2 * 60_000;

// alarm_control_panel state → alarmo.arm `mode`
const ALARMO_MODES: Record<string, string> = {
	armed_away: 'away',
	armed_home: 'home',
	armed_night: 'night',
	armed_vacation: 'vacation',
	armed_custom_bypass: 'custom',
};

/**
 * Sensors Alarmo reported open when it refused to arm. Alarmo keeps them in `open_sensors`
 * ({ entity_id: "open" }) on the still-disarmed entity; the call itself doesn't fail.
 */
export function armBlockers(entity: HassEntity | undefined, states: Record<string, HassEntity>): string[] {
	const open = entity?.attributes.open_sensors;
	if (!open || typeof open !== 'object') return [];
	return Object.keys(open).map((id) => sensorName(states[id], id));
}

/** The alarm's states as the card shows them (`arming` is the exit delay, `pending` the entry delay). */
export type AlarmStatus = 'disarmed' | 'arming' | 'armed' | 'pending' | 'triggered';

/** What the alarm card shows for Alarmo's state (`getAlarmView`). */
export interface AlarmView {
	status: AlarmStatus;
	/** The card's heading, e.g. the armed mode. */
	title: string;
	/** The line under it. */
	description: string;
	/** Epoch ms when the exit/entry delay ends, if one is running. */
	countdownEndsAt?: number;
	/** The whole delay in seconds, for the countdown's progress. */
	countdownTotalSec?: number;
}

/** Translate Alarmo's state and attributes into what the card shows. */
export function getAlarmView(entity: HassEntity | undefined): AlarmView {
	const state = entity?.state ?? 'disarmed';
	const attrs = entity?.attributes ?? {};
	const delay = typeof attrs.delay === 'number' && attrs.delay > 0 ? attrs.delay : undefined;
	// Alarmo sets `delay` (seconds) when it enters arming/pending; the delay starts at last_changed
	const countdown =
		delay && entity?.last_changed
			? { countdownEndsAt: Date.parse(entity.last_changed) + delay * 1000, countdownTotalSec: delay }
			: {};

	if (state === 'arming') {
		const target = (attrs.arm_mode as string) || (attrs.next_state as string) || '';
		return {
			status: 'arming',
			title: `Arming ${MODE_LABELS[target] ?? ''}`.trim(),
			description: 'Exit delay running. Leave and close all doors.',
			...countdown,
		};
	}
	if (state === 'pending') {
		return {
			status: 'pending',
			title: 'Entry detected',
			description: 'Disarm now before the alarm sounds.',
			...countdown,
		};
	}
	if (state === 'triggered') {
		return { status: 'triggered', title: 'Alarm triggered', description: 'Disarm to silence the alarm.' };
	}
	if (state.startsWith('armed_')) {
		return {
			status: 'armed',
			title: `Armed ${MODE_LABELS[state] ?? ''}`.trim(),
			description: state === 'armed_home' ? 'Perimeter armed' : 'Perimeter & interior armed',
		};
	}
	return { status: 'disarmed', title: 'Alarm disarmed', description: 'All zones ready to arm' };
}

/** Seconds left until `endsAt`, re-rendering every half second while running. */
function useSecondsRemaining(endsAt: number | undefined): number | undefined {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!endsAt) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 500);
		return () => clearInterval(timer);
	}, [endsAt]);
	return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : undefined;
}

/**
 * The exit or entry delay's countdown and its bar: the one part that ticks, so the card (and its
 * open-sensor scan) doesn't re-render twice a second through a delay.
 */
const AlarmCountdown: React.FC<{ endsAt: number; totalSec: number; pending: boolean }> = ({
	endsAt,
	totalSec,
	pending,
}) => {
	const secondsLeft = useSecondsRemaining(endsAt) ?? 0;
	return (
		<CardContent className="flex items-center gap-4">
			<span className={cn('font-mono font-semibold text-3xl tabular-nums', pending && 'text-destructive')}>
				{formatDuration(secondsLeft)}
			</span>
			<Progress value={(secondsLeft / totalSec) * 100} variant={pending ? 'destructive' : 'default'} />
		</CardContent>
	);
};

/**
 * The wall panel beeps through the exit and entry delays (`countdownBeep()`), since the card's
 * countdown and the panel LEDs go unnoticed from across the room. Every touch on the panel unlocks
 * audio, so the entry delay can beep when nobody has touched it since it loaded.
 */
function useCountdownBeeps(enabled: boolean, state: string | undefined, endsAt: number | undefined) {
	useEffect(() => {
		if (!enabled) return;
		document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
		return () => document.removeEventListener('pointerdown', unlockAudio, { capture: true });
	}, [enabled]);

	useEffect(() => {
		if (!enabled || !endsAt) return;
		// Queued on the audio clock, so every chime is the same and the rhythm stays even
		return playBeeps((atMs) => countdownBeep(state, endsAt - atMs));
	}, [enabled, state, endsAt]);
}

/** The alarm card's props. */
export interface AlarmCardProps {
	/** Less padding, for 10.5" panels. */
	compact?: boolean;
}

/**
 * The house alarm (Alarmo): its status and any exit or entry countdown (beeping on a wall panel), and
 * arming and disarming with the keypad's PIN. A refused arm lists the open sensors that stopped it,
 * with Arm anyway for a couple of minutes.
 */
export const AlarmCard: React.FC<AlarmCardProps> = ({ compact = false }) => {
	const { getHass, callService } = useHassApi();
	const connection = useHassConnection();
	// Alarmo's failed-to-arm event is for admins only: anyone else's subscription is refused (and logged)
	const isAdmin = useHassSelector((hass) => !!hass?.user?.is_admin, { watch: [] });
	const wallPanel = useWallPanelName();
	const { alarmPanel } = useHouseConfig();
	const alarmEntity =
		useHassSelector((hass) => (hass ? findAlarmPanel(hass, hass.states, alarmPanel) : undefined), {
			watch: ['alarm_control_panel'],
		}) ?? '';
	const alarmo = useEntity(alarmEntity);
	const view = getAlarmView(alarmo);
	useCountdownBeeps(!!wallPanel, alarmo?.state, view.countdownEndsAt);

	const [keypadMode, setKeypadMode] = useState<string | null>(null);
	const [requestedMode, setRequestedMode] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Alarmo refused to arm because these sensors are open
	const [blocked, setBlocked] = useState<{ mode: string; sensors: string[] } | null>(null);

	// The PIN, kept only so "Arm anyway" doesn't ask for it again
	const codeRef = useRef('');
	// alarmo.last_updated when the request was sent: a later update while still disarmed is Alarmo's answer
	const sentAt = useRef<string | undefined>(undefined);

	const openNow = useHassSelector(
		(hass) =>
			discoverOpenings(hass?.states ?? {})
				.filter((o) => o.isOpen)
				.map((o) => o.name),
		{ watch: openingsWatch(() => getHass()?.states) },
	);

	const refused = (mode: string, reason?: string) => {
		setRequestedMode(null);
		if (reason === 'invalid_code') {
			setError('Wrong PIN. Try again.');
			return;
		}
		// The latest states (this runs from event and timer callbacks)
		const states = getHass()?.states ?? {};
		const sensors = armBlockers(states[alarmEntity], states);
		// Alarmo didn't say which: list whatever is open
		const fallback = discoverOpenings(states)
			.filter((o) => o.isOpen)
			.map((o) => o.name);
		if (sensors.length || fallback.length) setBlocked({ mode, sensors: sensors.length ? sensors : fallback });
		else setError(`Couldn't arm${MODE_LABELS[mode] ? ` ${MODE_LABELS[mode]}` : ''}. Try again.`);
	};

	// Alarmo responded (state changed) or never did: stop showing the pending request
	useEffect(() => {
		setRequestedMode(null);
		// A failure ("Wrong PIN", "Couldn't disarm") is about the state before: drop it once that moves on
		setError(null);
		if (alarmo?.state !== 'disarmed') {
			setBlocked(null);
			codeRef.current = '';
		}
	}, [alarmo?.state]);

	// A refusal updates open_sensors without changing the state
	useEffect(() => {
		if (!requestedMode || !alarmo || alarmo.state !== 'disarmed' || alarmo.last_updated === sentAt.current) return;
		if (armBlockers(alarmo, getHass()?.states ?? {}).length) refused(requestedMode);
	}, [alarmo?.last_updated]);

	// Alarmo also fires an event, which arrives even when open_sensors didn't change (same sensors as last
	// time); without it (not an admin), the attribute and the timeout below
	useEffect(() => {
		if (!requestedMode || !connection || !isAdmin) return;
		let unsubscribe: (() => void) | undefined;
		let active = true;
		connection
			.subscribeEvents((event) => {
				const data = (event as unknown as { data?: { entity_id?: string; reason?: string } }).data;
				if (data?.entity_id && data.entity_id !== alarmEntity) return;
				refused(requestedMode, data?.reason);
			}, 'alarmo_failed_to_arm')
			.then((unsub) => {
				if (active) unsubscribe = unsub;
				else unsub();
			})
			.catch(() => {});
		return () => {
			active = false;
			unsubscribe?.();
		};
	}, [requestedMode, connection, isAdmin]);

	useEffect(() => {
		if (!blocked) return;
		const timer = setTimeout(() => {
			setBlocked(null);
			codeRef.current = '';
		}, BLOCKED_MS);
		return () => clearTimeout(timer);
	}, [blocked]);

	useEffect(() => {
		if (!requestedMode) return;
		const timer = setTimeout(() => {
			if (getHass()?.states[alarmEntity]?.state === 'disarmed') refused(requestedMode);
			else setRequestedMode(null);
		}, REQUEST_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [requestedMode]);

	// Every wall panel signs in as the same user, so a panel says which it is just before it arms or
	// disarms (script.alarm_note_source), for the alarm's notifications; a failure never blocks the change
	const noteSource = () =>
		wallPanel
			? callService('script', 'alarm_note_source', { source: wallPanel }, { errors: 'throw' }).catch(() => {})
			: Promise.resolve();

	const arm = (mode: string, code: string, force = false) => {
		setError(null);
		setBlocked(null);
		codeRef.current = code;
		sentAt.current = alarmo?.last_updated;
		setRequestedMode(mode);
		const call = noteSource().then(() =>
			force
				? callService(
						'alarmo',
						'arm',
						{ entity_id: alarmEntity, code, mode: ALARMO_MODES[mode], force: true },
						{ errors: 'throw' },
					)
				: callService(
						'alarm_control_panel',
						mode === 'armed_away' ? 'alarm_arm_away' : 'alarm_arm_home',
						{ entity_id: alarmEntity, code },
						{ errors: 'throw' },
					),
		);
		call.catch((err) => {
			setRequestedMode(null);
			setError(`Couldn't arm: ${(err as Error)?.message || 'check the PIN'}`);
		});
	};

	const submit = (code: string) => {
		const mode = keypadMode;
		if (!mode) return;
		if (mode !== 'disarmed') {
			arm(mode, code);
			return;
		}
		setError(null);
		noteSource()
			.then(() =>
				callService('alarm_control_panel', 'alarm_disarm', { entity_id: alarmEntity, code }, { errors: 'throw' }),
			)
			.catch((err) => {
				setError(`Couldn't disarm: ${(err as Error)?.message || 'check the PIN'}`);
			});
	};

	const dismissBlocked = () => {
		setBlocked(null);
		codeRef.current = '';
	};

	const isAlerting = view.status === 'pending' || view.status === 'triggered';
	const isWaiting = requestedMode !== null && view.status === 'disarmed';
	const isBlocked = blocked !== null && view.status === 'disarmed' && !isWaiting;
	const Icon = isBlocked ? TriangleAlert : isAlerting ? ShieldAlert : view.status === 'disarmed' ? Shield : ShieldCheck;

	const isAre = (names: string[]) => `${nameList(names)} ${names.length === 1 ? 'is' : 'are'} open`;
	let title = view.title;
	let description = view.description;
	if (isWaiting) {
		title = `Arming ${MODE_LABELS[requestedMode] ?? ''}…`;
		description = 'Waiting for the alarm to respond';
	} else if (isBlocked) {
		// The refusal replaces the title so the card doesn't grow and push the garages off screen
		const it = blocked.sensors.length === 1 ? 'it' : 'them';
		title = `Can't arm ${MODE_LABELS[blocked.mode] ?? ''}`.trim();
		description = `${isAre(blocked.sensors)}. Close ${it} and try again, or arm anyway to bypass ${it}.`;
	} else if (view.status === 'disarmed' && openNow.length > 0) {
		description = isAre(openNow);
	}
	const warn = isBlocked || (view.status === 'disarmed' && openNow.length > 0 && !isWaiting);

	return (
		<Card
			className={cn(
				compact ? 'gap-3 py-4' : 'gap-4',
				isAlerting && 'border-destructive',
				isBlocked && 'border-warning',
			)}
		>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<Icon
						className={cn(
							'size-5',
							isAlerting && 'text-destructive',
							isBlocked && 'text-warning',
							view.status === 'armed' && 'text-success',
							view.status === 'disarmed' && !isBlocked && 'text-muted-foreground',
						)}
					/>
					{title}
				</CardTitle>
				{/* One line, so a door opening never grows the card (the header's Open button lists them all);
				    a refusal to arm, which needs reading, may wrap */}
				<CardDescription className={cn(warn && 'text-warning', !isBlocked && 'truncate')} title={description}>
					{description}
				</CardDescription>
			</CardHeader>

			{/* Actions get their own full-width row so they never squeeze the title */}
			<CardContent className="flex gap-2 *:flex-1">
				{isBlocked ? (
					<>
						<Button variant="outline" size="xl" onClick={dismissBlocked}>
							Dismiss
						</Button>
						<Button variant="warning" size="xl" onClick={() => arm(blocked.mode, codeRef.current, true)}>
							Arm anyway
						</Button>
					</>
				) : isWaiting ? (
					<Button variant="outline" size="xl" disabled>
						<Loader2 className="animate-spin" />
						Arming
					</Button>
				) : view.status === 'disarmed' ? (
					<>
						<Button variant="outline" size="xl" onClick={() => setKeypadMode('armed_home')}>
							Arm Home
						</Button>
						<Button size="xl" onClick={() => setKeypadMode('armed_away')}>
							Arm Away
						</Button>
					</>
				) : view.status === 'arming' ? (
					<Button variant="outline" size="xl" onClick={() => setKeypadMode('disarmed')}>
						Cancel
					</Button>
				) : (
					<Button variant="destructive" size="xl" onClick={() => setKeypadMode('disarmed')}>
						Disarm
					</Button>
				)}
			</CardContent>

			{!!view.countdownEndsAt && !!view.countdownTotalSec && (
				<AlarmCountdown
					endsAt={view.countdownEndsAt}
					totalSec={view.countdownTotalSec}
					pending={view.status === 'pending'}
				/>
			)}

			{error && (
				<CardContent>
					<p className="text-destructive text-sm">{error}</p>
				</CardContent>
			)}

			<KeypadModal
				isOpen={keypadMode !== null}
				onClose={() => setKeypadMode(null)}
				onSubmit={submit}
				targetMode={keypadMode ?? 'disarmed'}
				openSensors={keypadMode && keypadMode !== 'disarmed' ? openNow : []}
			/>
		</Card>
	);
};
