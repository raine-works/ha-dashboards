import { describe, expect, it } from 'bun:test';
import {
	addMinutes,
	formatClock,
	hasFinished,
	IDLE_TIMER,
	isRunning,
	MISSED_FINISH_MS,
	remainingMs,
	restoreTimer,
	secondsLeft,
	storeTimer,
	timerDoneMessage,
	togglePause,
} from '../timer';

const T0 = 1_000_000;

describe('panel timer', () => {
	it('starts running when minutes are added and counts down by the clock', () => {
		const state = addMinutes(IDLE_TIMER, 5, T0);
		expect(isRunning(state)).toBe(true);
		expect(secondsLeft(state, T0)).toBe(300);
		expect(secondsLeft(state, T0 + 61_500)).toBe(239);
		expect(state.totalMs).toBe(300_000);
	});

	it('adds to the remaining time and grows the total', () => {
		const state = addMinutes(addMinutes(IDLE_TIMER, 5, T0), 3, T0 + 60_000);
		expect(secondsLeft(state, T0 + 60_000)).toBe(420);
		expect(state.totalMs).toBe(420_000);
	});

	it('pauses and resumes without losing time', () => {
		let state = addMinutes(IDLE_TIMER, 1, T0);
		state = togglePause(state, T0 + 20_000);
		expect(isRunning(state)).toBe(false);
		expect(secondsLeft(state, T0 + 999_000)).toBe(40);
		state = togglePause(state, T0 + 999_000);
		expect(secondsLeft(state, T0 + 1_009_000)).toBe(30);
		expect(togglePause(IDLE_TIMER, T0)).toBe(IDLE_TIMER);
	});

	it('finishes at the end time and never goes negative', () => {
		const state = addMinutes(IDLE_TIMER, 1, T0);
		expect(hasFinished(state, T0 + 59_999)).toBe(false);
		expect(hasFinished(state, T0 + 60_000)).toBe(true);
		expect(remainingMs(state, T0 + 90_000)).toBe(0);
	});

	it('formats the clock', () => {
		expect(formatClock(0)).toBe('00:00');
		expect(formatClock(5)).toBe('00:05');
		expect(formatClock(245)).toBe('04:05');
		expect(formatClock(600)).toBe('10:00');
		expect(formatClock(3600)).toBe('1:00:00');
		expect(formatClock(3845)).toBe('1:04:05');
	});
});

describe('timerDoneMessage', () => {
	it('says how long the timer was', () => {
		expect(timerDoneMessage(10 * 60_000)).toBe('Your 10 minute timer is done.');
		expect(timerDoneMessage(60 * 60_000)).toBe('Your 1 hour timer is done.');
		expect(timerDoneMessage(90 * 60_000)).toBe('Your 90 minute timer is done.');
		expect(timerDoneMessage(0)).toBe('The timer is done.');
	});
});

describe('stored timer', () => {
	it('stores nothing while idle', () => {
		expect(storeTimer(IDLE_TIMER)).toBeNull();
		expect(restoreTimer(null, T0)).toEqual(IDLE_TIMER);
	});

	it('comes back running toward the same end after a reload', () => {
		const running = addMinutes(IDLE_TIMER, 10, T0);
		const back = restoreTimer(storeTimer(running), T0 + 30_000);
		expect(back).toEqual(running);
		expect(secondsLeft(back, T0 + 30_000)).toBe(570);
	});

	it('comes back paused with the time it had left', () => {
		const paused = togglePause(addMinutes(IDLE_TIMER, 5, T0), T0 + 60_000);
		const back = restoreTimer(storeTimer(paused), T0 + 3_600_000);
		expect(isRunning(back)).toBe(false);
		expect(secondsLeft(back, T0 + 3_600_000)).toBe(240);
	});

	it('keeps one that ended during the reload, to announce, but not an old one', () => {
		const running = addMinutes(IDLE_TIMER, 1, T0);
		const ended = T0 + 60_000;
		expect(hasFinished(restoreTimer(storeTimer(running), ended + 5_000), ended + 5_000)).toBe(true);
		expect(restoreTimer(storeTimer(running), ended + MISSED_FINISH_MS + 1)).toEqual(IDLE_TIMER);
	});

	it('treats anything unreadable as idle', () => {
		expect(restoreTimer('not json', T0)).toEqual(IDLE_TIMER);
		expect(restoreTimer('{"endsAt":"soon","remainingMs":0,"totalMs":1}', T0)).toEqual(IDLE_TIMER);
		expect(restoreTimer('{"endsAt":null,"remainingMs":0,"totalMs":60000}', T0)).toEqual(IDLE_TIMER);
	});
});
