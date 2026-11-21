import { describe, expect, it } from 'bun:test';
import {
	applianceFinished,
	formatJobState,
	formatShortTime,
	formatTimeLeft,
	getApplianceView,
	laundrySummary,
} from '../laundry';

describe('laundry', () => {
	it('formats time remaining', () => {
		expect(formatTimeLeft('42')).toBe('42m left');
		expect(formatTimeLeft(65)).toBe('1h 5m left');
		expect(formatTimeLeft('120')).toBe('2h left');
		expect(formatTimeLeft('0')).toBe('');
		expect(formatTimeLeft('unavailable')).toBe('');
	});

	it('labels job states, title-casing unknown ones', () => {
		expect(formatJobState('rinse')).toBe('Rinsing');
		expect(formatJobState('internal_care')).toBe('Internal Care');
		expect(formatJobState('none')).toBe('');
	});

	it('derives running, paused, complete and idle views', () => {
		expect(getApplianceView('run', 'rinse', '42')).toEqual({
			status: 'running',
			headline: '42m left',
			detail: 'Rinsing',
		});
		expect(getApplianceView('run', 'none', '0')).toEqual({ status: 'running', headline: 'Running', detail: 'Active' });
		expect(getApplianceView('pause', 'wash', '30')).toEqual({
			status: 'paused',
			headline: 'Paused',
			detail: '30m left',
		});
		expect(getApplianceView('stop', 'finished', '0').status).toBe('complete');
		expect(getApplianceView('stop', 'none', '0')).toEqual({ status: 'idle', headline: 'Idle', detail: 'Off' });
		expect(getApplianceView(undefined, undefined, undefined).status).toBe('idle');
	});

	it('detects a finished cycle only from running or paused', () => {
		expect(applianceFinished('running', 'complete')).toBe(true);
		expect(applianceFinished('paused', 'complete')).toBe(true);
		expect(applianceFinished(undefined, 'complete')).toBe(false);
		expect(applianceFinished('idle', 'complete')).toBe(false);
		expect(applianceFinished('complete', 'complete')).toBe(false);
		expect(applianceFinished('running', 'paused')).toBe(false);
	});
});

describe('laundrySummary', () => {
	const machine = (name: string, machineState: string, jobState: string, minutesLeft?: number) => ({
		name,
		view: getApplianceView(machineState, jobState, minutesLeft?.toString()),
		minutesLeft,
	});

	it('is nothing while every machine is idle', () => {
		expect(laundrySummary([machine('Washer', 'stop', 'none'), machine('Dryer', 'stop', 'none')])).toBeNull();
	});

	it('shows the running machine that finishes soonest', () => {
		expect(laundrySummary([machine('Washer', 'run', 'wash', 65), machine('Dryer', 'run', 'drying', 32)])).toEqual({
			status: 'running',
			label: '32m',
			name: 'Dryer',
			description: 'Washer: 1h 5m left · Dryer: 32m left',
		});
	});

	it('puts running before paused before done', () => {
		expect(
			laundrySummary([machine('Washer', 'stop', 'finish'), machine('Dryer', 'pause', 'drying', 20)]),
		).toMatchObject({
			status: 'paused',
			label: 'Paused',
			name: 'Dryer',
		});
		expect(laundrySummary([machine('Washer', 'stop', 'finish'), machine('Dryer', 'stop', 'none')])).toMatchObject({
			status: 'complete',
			label: 'Done',
			name: 'Washer',
		});
	});

	it('runs with no label when the time left is unknown', () => {
		expect(laundrySummary([machine('Washer', 'run', 'wash')])?.label).toBe('');
		expect(formatShortTime(125)).toBe('2h 5m');
	});
});
