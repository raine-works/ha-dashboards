/**
 * The wall panel timer's state, tracked against the wall clock (an end timestamp) rather than by
 * counting interval ticks, so it stays accurate when the panel throttles timers (e.g. screen asleep).
 */

/** A timer: running toward `endsAt`, paused with `remainingMs` left, or idle. */
export interface TimerState {
	/** Epoch ms when a running timer ends; null when paused or idle. */
	endsAt: number | null;
	/** Ms left while paused (or 0 when idle). */
	remainingMs: number;
	/** Largest total so far, for the progress bar. */
	totalMs: number;
}

/** No timer set. */
export const IDLE_TIMER: TimerState = { endsAt: null, remainingMs: 0, totalMs: 0 };

/** Ms left at `now` (never below 0). */
export function remainingMs(state: TimerState, now: number): number {
	return state.endsAt !== null ? Math.max(0, state.endsAt - now) : state.remainingMs;
}

/** Whole seconds left at `now`, rounded up (so it shows 1 until it ends). */
export const secondsLeft = (state: TimerState, now: number) => Math.ceil(remainingMs(state, now) / 1000);

/** Whether the timer is counting down (not paused or idle). */
export const isRunning = (state: TimerState) => state.endsAt !== null;

/** Add minutes and (re)start the timer. */
export function addMinutes(state: TimerState, minutes: number, now: number): TimerState {
	const remaining = remainingMs(state, now) + minutes * 60_000;
	return { endsAt: now + remaining, remainingMs: 0, totalMs: Math.max(state.totalMs, remaining) };
}

/** Pause a running timer, or resume a paused one; an idle timer stays idle. */
export function togglePause(state: TimerState, now: number): TimerState {
	if (state.endsAt !== null) return { ...state, endsAt: null, remainingMs: remainingMs(state, now) };
	if (state.remainingMs > 0) return { ...state, endsAt: now + state.remainingMs, remainingMs: 0 };
	return state;
}

/** Whether a running timer has reached its end at `now`. */
export const hasFinished = (state: TimerState, now: number) => state.endsAt !== null && now >= state.endsAt;

/** A timer that ended at most this long before the panel came back (a reload mid-finish) still announces. */
export const MISSED_FINISH_MS = 60_000;

/** The timer as stored on the device (localStorage), so it survives the panel reloading; null when idle. */
export function storeTimer(state: TimerState): string | null {
	return state.endsAt === null && state.remainingMs <= 0 ? null : JSON.stringify(state);
}

/**
 * The stored timer back, as it was: running on toward its end, or paused. One that ended while the
 * panel was away is kept (to announce at once) only if it ended within `MISSED_FINISH_MS`; anything
 * older or unreadable is idle.
 */
export function restoreTimer(stored: string | null, now: number): TimerState {
	if (!stored) return IDLE_TIMER;
	try {
		const { endsAt, remainingMs, totalMs } = JSON.parse(stored) as Partial<TimerState>;
		const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
		if (!finite(totalMs) || !finite(remainingMs) || !(endsAt === null || finite(endsAt))) return IDLE_TIMER;
		if (endsAt !== null && now - endsAt > MISSED_FINISH_MS) return IDLE_TIMER;
		if (endsAt === null && remainingMs <= 0) return IDLE_TIMER;
		return { endsAt, remainingMs, totalMs };
	} catch {
		return IDLE_TIMER;
	}
}

/** "04:05" (or "1:04:05" past an hour). */
export function formatClock(totalSeconds: number): string {
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	const mmss = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	return h > 0 ? `${h}:${mmss}` : mmss;
}

/** What the announcement says: "Your 10 minute timer is done." (just "The timer is done." without a length). */
export function timerDoneMessage(totalMs: number): string {
	const minutes = Math.round(totalMs / 60_000);
	if (minutes < 1) return 'The timer is done.';
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return `Your ${hours} hour timer is done.`;
	}
	return `Your ${minutes} minute timer is done.`;
}
