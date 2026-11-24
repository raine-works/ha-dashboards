/**
 * Washer and dryer status from SmartThings-style sensors: each machine's view, and the header
 * chip's summary.
 *
 * @module
 */

/** Where a washer or dryer is in its cycle. */
export type ApplianceStatus = 'running' | 'paused' | 'complete' | 'idle';

/** A machine's state as the laundry card shows it. */
export interface ApplianceView {
	/** Where it is in its cycle. */
	status: ApplianceStatus;
	/** Primary line, e.g. "42m left", "Paused", "Complete", "Idle". */
	headline: string;
	/** Secondary line, e.g. "Rinsing", "1h 5m left", "Ready to unload", "Off". */
	detail: string;
}

const JOB_STATE_LABELS: Record<string, string> = {
	air_wash: 'Air Wash',
	ai_rinse: 'AI Rinse',
	ai_spin: 'AI Spin',
	ai_wash: 'AI Wash',
	ai_drying: 'AI Drying',
	cooling: 'Cooling',
	delay_wash: 'Delay Wash',
	dehumidifying: 'Dehumidifying',
	drying: 'Drying',
	finish: 'Complete',
	finished: 'Complete',
	freeze_protection: 'Freeze Protect',
	pre_wash: 'Pre Wash',
	refreshing: 'Refreshing',
	rinse: 'Rinsing',
	sanitizing: 'Sanitizing',
	spin: 'Spinning',
	wash: 'Washing',
	weight_sensing: 'Sensing Weight',
	wrinkle_prevent: 'Wrinkle Prevent',
};
const NO_JOB = new Set(['none', 'stop', 'unknown', 'unavailable', '']);

/** Human label for a job state; unknown states are title-cased ("internal_care" → "Internal Care"). */
export function formatJobState(state: string | undefined): string {
	if (!state || NO_JOB.has(state)) return '';
	return JOB_STATE_LABELS[state] ?? state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "42m left", "1h 5m left", "2h left"; empty for zero/unknown. */
export function formatTimeLeft(minutes: string | number | undefined): string {
	const m = Math.round(Number(minutes));
	if (!Number.isFinite(m) || m <= 0) return '';
	if (m < 60) return `${m}m left`;
	const hours = Math.floor(m / 60);
	const mins = m % 60;
	return mins > 0 ? `${hours}h ${mins}m left` : `${hours}h left`;
}

/**
 * A machine's view from its sensors.
 * @param machineState The machine state sensor (`run`, `pause`, `stop`…).
 * @param jobState The job state sensor (`wash`, `rinse`, `finish`…).
 * @param timeRemaining Minutes left, as the sensor reports them.
 */
export function getApplianceView(machineState?: string, jobState?: string, timeRemaining?: string): ApplianceView {
	if (machineState === 'run') {
		return {
			status: 'running',
			headline: formatTimeLeft(timeRemaining) || 'Running',
			detail: formatJobState(jobState) || 'Active',
		};
	}
	if (machineState === 'pause') {
		return { status: 'paused', headline: 'Paused', detail: formatTimeLeft(timeRemaining) || 'Cycle paused' };
	}
	if (jobState === 'finish' || jobState === 'finished') {
		return { status: 'complete', headline: 'Complete', detail: 'Ready to unload' };
	}
	return { status: 'idle', headline: 'Idle', detail: 'Off' };
}

/** A cycle just finished: running/paused → complete (not first sightings or idle → complete). */
export function applianceFinished(previous: ApplianceStatus | undefined, current: ApplianceStatus): boolean {
	return current === 'complete' && (previous === 'running' || previous === 'paused');
}

/** "32m", "1h 5m", "2h" (the header chip's time); empty for zero/unknown. */
export function formatShortTime(minutes: string | number | undefined): string {
	return formatTimeLeft(minutes).replace(/ left$/, '');
}

/** The header chip: the laundry's most pressing state, or none while every machine is idle. */
export interface LaundrySummary {
	status: Exclude<ApplianceStatus, 'idle'>;
	/** "32m" (the soonest running machine's time left), "Paused", "Done"; empty while running with no time. */
	label: string;
	/** The machine the chip stands for (the soonest running, paused or done one). */
	name: string;
	/** "Washer: 32m left · Dryer: Idle" */
	description: string;
}

/** A washer or dryer, as `laundrySummary` takes it. */
export interface LaundryMachine {
	/** "Washer", "Dryer". */
	name: string;
	/** Its view (`getApplianceView`). */
	view: ApplianceView;
	/** Minutes left while running (`sensor.*_time_remaining`). */
	minutesLeft?: string | number;
}

// Running first (the soonest done), then paused, then done
const SUMMARY_ORDER: Record<ApplianceStatus, number> = { running: 0, paused: 1, complete: 2, idle: 3 };

/**
 * The header chip for the machines: the soonest running one, else a paused one, else a done one.
 * @returns Null while every machine is idle (or there are none).
 */
export function laundrySummary(machines: LaundryMachine[]): LaundrySummary | null {
	const minutes = (m: LaundryMachine) => {
		const n = Number(m.minutesLeft);
		return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
	};
	const [first] = [...machines].sort(
		(a, b) => SUMMARY_ORDER[a.view.status] - SUMMARY_ORDER[b.view.status] || minutes(a) - minutes(b),
	);
	if (!first || first.view.status === 'idle') return null;
	const status = first.view.status;
	return {
		status,
		label: status === 'running' ? formatShortTime(first.minutesLeft) : status === 'paused' ? 'Paused' : 'Done',
		name: first.name,
		description: machines.map((m) => `${m.name}: ${m.view.headline}`).join(' · '),
	};
}
