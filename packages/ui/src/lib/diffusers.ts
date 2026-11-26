/**
 * Scent diffusers (the EverScent integration): discovery, quick scents, and what a diffuser's row
 * shows.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import type { EntityWatch } from './hass-store';
import { pad2 } from './time';
import { isUnavailable } from './values';

/** The EverScent integration's platform (`raine-works/ha-everscent`). */
export const DIFFUSER_PLATFORM = 'everscent';

/** A whole-home scent diffuser: its power switch and the entities beside it (`<device>_*`). */
export interface Diffuser {
	/** `switch.<device>_power` */
	power: string;
	/** Its device's name. */
	name: string;
	/** `sensor.<device>_fragrance` */
	fragrance: string;
	/** `sensor.<device>_fragrance_category` */
	category: string;
	/** `sensor.<device>_concentration` */
	concentration: string;
	/** `binary_sensor.<device>_fragrance_low` */
	low: string;
	/** `binary_sensor.<device>_online` */
	online: string;
	/** `binary_sensor.<device>_fan`: on while it diffuses, off between bursts */
	fan: string;
	/** `button.<device>_quick_scent`: its state is when it was last pressed */
	quickScent: string;
	/** `number.<device>_quick_scent_duration`: how long a quick scent runs, in seconds */
	quickScentDuration: string;
}

/** A quick scent's length when its duration entity can't be read (the integration's default). */
export const QUICK_SCENT_DEFAULT_S = 30;

/** Every entity a diffuser row reads, for `useHassSelector`'s `watch`. */
export const diffuserEntities = (d: Diffuser): string[] => [
	d.power,
	d.fragrance,
	d.category,
	d.concentration,
	d.low,
	d.online,
	d.fan,
	d.quickScent,
	d.quickScentDuration,
];

/** What `discoverDiffusers` reads: the power switches (the house's other switches skip it). */
export const DIFFUSERS_WATCH: EntityWatch = (id) => id.startsWith('switch.') && id.endsWith('_power');

/** Every EverScent diffuser, found by its power switch (`switch.*_power` from the everscent platform), by name. */
export function discoverDiffusers(
	hass: Pick<HomeAssistant, 'entities' | 'devices'>,
	states: Record<string, HassEntity>,
): Diffuser[] {
	return Object.keys(states)
		.filter(
			(id) =>
				id.startsWith('switch.') &&
				id.endsWith('_power') &&
				hass.entities?.[id]?.platform === DIFFUSER_PLATFORM &&
				!hass.entities?.[id]?.hidden,
		)
		.map((power) => {
			const prefix = power.slice('switch.'.length, -'_power'.length);
			const deviceId = hass.entities?.[power]?.device_id;
			const device = deviceId ? hass.devices?.[deviceId] : undefined;
			// Added in a later version of the integration, so it took the device's newer name: found by device
			const duration = Object.values(hass.entities ?? {}).find(
				(e) =>
					e.device_id === deviceId &&
					e.platform === DIFFUSER_PLATFORM &&
					e.entity_id.startsWith('number.') &&
					e.entity_id.endsWith('_quick_scent_duration'),
			)?.entity_id;
			return {
				power,
				name: device?.name_by_user || device?.name || prefix.replaceAll('_', ' '),
				fragrance: `sensor.${prefix}_fragrance`,
				category: `sensor.${prefix}_fragrance_category`,
				concentration: `sensor.${prefix}_concentration`,
				low: `binary_sensor.${prefix}_fragrance_low`,
				online: `binary_sensor.${prefix}_online`,
				fan: `binary_sensor.${prefix}_fan`,
				quickScent: `button.${prefix}_quick_scent`,
				quickScentDuration: duration ?? `number.${prefix}_quick_scent_duration`,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

const known = (entity: HassEntity | undefined) =>
	entity && !isUnavailable(entity.state) && entity.state !== '' ? entity.state : null;

/**
 * A quick scent's press as this page saw it arrive: the button's state (when it was pressed, on Home
 * Assistant's clock) and when it arrived (epoch ms, on this device's clock).
 */
export interface PressSeen {
	/** The button's state: the press's time, as Home Assistant wrote it. */
	pressed: string;
	/** When this page saw it, by `Date.now()`. */
	at: number;
}

/**
 * How far this device's clock may be from Home Assistant's for a press seen arriving to be timed from
 * its arrival: further apart, it isn't the press that just happened (or the clocks are hopeless).
 */
export const PRESS_SEEN_WITHIN_MS = 15_000;

/**
 * When the quick scent last pressed ends (epoch ms, on this device's clock), or null when it was
 * never pressed. The button's state is when it was pressed, by Home Assistant's clock; it runs for
 * the duration entity's seconds. A press `seen` arriving while the page was open is timed from its
 * arrival instead: a phone or panel whose clock is two seconds behind Home Assistant's would
 * otherwise count a 30-second scent down from 32.
 */
export function quickScentUntil(
	d: Diffuser,
	states: Record<string, HassEntity | undefined>,
	seen?: PressSeen | null,
): number | null {
	const state = known(states[d.quickScent]);
	const pressed = Date.parse(state ?? '');
	if (!Number.isFinite(pressed)) return null;
	const seconds = Number(known(states[d.quickScentDuration]));
	const length = (Number.isFinite(seconds) && seconds > 0 ? seconds : QUICK_SCENT_DEFAULT_S) * 1000;
	const live = seen != null && seen.pressed === state && Math.abs(seen.at - pressed) <= PRESS_SEEN_WITHIN_MS;
	return (live ? seen.at : pressed) + length;
}

/** A running quick scent's time left on its button: "24s left", "1:30 left" (whole seconds, rounded up). */
export function formatScentLeft(ms: number): string {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	return seconds < 60 ? `${seconds}s left` : `${Math.floor(seconds / 60)}:${pad2(seconds % 60)} left`;
}

/** What a diffuser's row shows (`getDiffuserView`). */
export interface DiffuserView {
	status: 'on' | 'off' | 'offline';
	/** Diffusing right now (the fan runs in bursts while on). */
	scenting: boolean;
	/** A quick scent is running (until `quickScentUntil`). */
	quickScenting: boolean;
	/**
	 * The oil is running low (`_fragrance_low`). EverScent reports no amount: its `fragranceLevel`
	 * reads 1 with a full bottle and a nearly empty one alike, so the dashboards don't show it.
	 */
	low: boolean;
	/** The fragrance, its category and the concentration setting; null where unknown. */
	fragrance: string | null;
	category: string | null;
	concentration: string | null;
	/** Online, with its quick scent button available. */
	canQuickScent: boolean;
	/** "On · Strong · Diffusing", "On · Strong · Between bursts", "On · Quick scent", "Off", "Offline". */
	label: string;
}

/** What a diffuser row shows, at `now` (epoch ms); `seen`: its last quick scent's press arriving (`quickScentUntil`). */
export function getDiffuserView(
	d: Diffuser,
	states: Record<string, HassEntity | undefined>,
	now: number,
	seen?: PressSeen | null,
): DiffuserView {
	const power = known(states[d.power]);
	const offline = power == null || states[d.online]?.state === 'off';
	const status: DiffuserView['status'] = offline ? 'offline' : power === 'on' ? 'on' : 'off';
	const scenting = status === 'on' && states[d.fan]?.state === 'on';
	const until = quickScentUntil(d, states, seen);
	const quickScenting = status !== 'offline' && until != null && now < until;
	const concentration = known(states[d.concentration]);
	const label =
		status === 'offline'
			? 'Offline'
			: quickScenting
				? `${status === 'on' ? 'On' : 'Off'} · Quick scent`
				: status === 'off'
					? 'Off'
					: ['On', concentration, scenting ? 'Diffusing' : 'Between bursts'].filter(Boolean).join(' · ');
	return {
		status,
		scenting,
		quickScenting,
		low: states[d.low]?.state === 'on',
		fragrance: known(states[d.fragrance]),
		category: known(states[d.category]),
		concentration,
		canQuickScent: !offline && states[d.quickScent] != null && states[d.quickScent]?.state !== 'unavailable',
		label,
	};
}
