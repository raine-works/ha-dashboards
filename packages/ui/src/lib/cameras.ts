/**
 * Cameras: UniFi Protect's entities grouped into physical cameras, their smart detections and
 * snapshots, and the talkback messages for each.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import type { EntityWatch } from './hass-store';
import { HOLIDAY_MESSAGES } from './holidayMessages';
import type { HolidayId } from './holidays';

/** A physical camera, from the entities sharing its prefix. */
export interface CameraDevice {
	/** Stable id: the shared entity_id prefix (e.g. `front_porch_doorbell`). */
	id: string;
	/** Its name, without the channel's ("Front Porch Doorbell"). */
	label: string;
	/** Camera entity shown in the main view. */
	entityId: string;
	/** Secondary lens (e.g. doorbell package camera) shown picture-in-picture. */
	pipEntityId?: string;
	/** Its `media_player.<prefix>_speaker`, for talkback, when it has one. */
	speakerEntity?: string;
	/** False while the main stream is unavailable. */
	available: boolean;
}

// UniFi Protect exposes each physical camera as several entities sharing a prefix
const CHANNEL_SUFFIX = /_(high|medium|low)_resolution_channel(_insecure)?$/;
const PACKAGE_SUFFIX = /_package_camera(_insecure)?$/;
// Prefer medium: full quality on a wall panel without the bandwidth of the high channel
const CHANNEL_PRIORITY = ['medium', 'high', 'low'];
const FRIENDLY_SUFFIX = / (High|Medium|Low) resolution channel( \(insecure\))?$/i;

/**
 * The device prefix UniFi Protect shares across a camera's entities
 * (`camera.front_porch_doorbell_medium_resolution_channel` → `front_porch_doorbell`), so its
 * sensors (`binary_sensor.<prefix>_person_detected`, ...) follow the camera through renames.
 */
export function cameraPrefix(entityId: string): string {
	return entityId
		.replace(/^camera\./, '')
		.replace(CHANNEL_SUFFIX, '')
		.replace(PACKAGE_SUFFIX, '');
}

// What `cameraDetections` reads (with DETECTION_SENSORS' types)
const DETECTION_ENTITY = /^(binary_sensor\..+_(person|animal|vehicle)_detected|event\..+_package)$/;
/**
 * What `discoverCameras` reads (cameras and their talkback speakers): by name, so a speaker playing
 * music or another binary sensor changing skips the scan.
 */
export const CAMERAS_WATCH: EntityWatch = (id) =>
	id.startsWith('camera.') || (id.startsWith('media_player.') && id.endsWith('_speaker'));
/** What `cameraDetections` reads for every camera (with `discoverCameras`; the speakers don't count). */
export const CAMERA_ACTIVITY_WATCH: EntityWatch = (id) => id.startsWith('camera.') || DETECTION_ENTITY.test(id);

/**
 * Group camera entities into physical cameras: one main stream per device, the package lens
 * as its picture-in-picture, and the matching `media_player.<prefix>_speaker` for talkback.
 */
export function discoverCameras(states: Record<string, HassEntity>): CameraDevice[] {
	const groups = new Map<string, { channels: Map<string, string>; pip?: string; other?: string }>();
	const group = (prefix: string) => {
		let g = groups.get(prefix);
		if (!g) {
			g = { channels: new Map() };
			groups.set(prefix, g);
		}
		return g;
	};

	for (const entityId of Object.keys(states)) {
		if (!entityId.startsWith('camera.')) continue;
		const objectId = entityId.slice('camera.'.length);
		const channel = CHANNEL_SUFFIX.exec(objectId);
		if (channel) {
			const g = group(objectId.slice(0, channel.index));
			// Prefer the secure channel when both exist
			if (!channel[2] || !g.channels.has(channel[1])) g.channels.set(channel[1], entityId);
		} else if (PACKAGE_SUFFIX.test(objectId)) {
			group(objectId.replace(PACKAGE_SUFFIX, '')).pip = entityId;
		} else {
			group(objectId).other = entityId;
		}
	}

	const cameras: CameraDevice[] = [];
	for (const [prefix, g] of groups) {
		// A channel turned off in Protect stays as an unavailable entity: skip it for one that streams
		const channels = CHANNEL_PRIORITY.map((c) => g.channels.get(c)).filter((id): id is string => !!id);
		const entityId = channels.find((id) => states[id].state !== 'unavailable') || channels[0] || g.other || g.pip;
		if (!entityId) continue;
		const pipEntityId = g.pip && g.pip !== entityId ? g.pip : undefined;
		const state = states[entityId];
		const friendlyName = state.attributes?.friendly_name;
		const speaker = `media_player.${prefix}_speaker`;

		cameras.push({
			id: prefix,
			label: friendlyName?.replace(FRIENDLY_SUFFIX, '') || prefix.replace(/_/g, ' '),
			entityId,
			pipEntityId,
			speakerEntity: states[speaker] ? speaker : undefined,
			available: state.state !== 'unavailable',
		});
	}

	return cameras.sort((a, b) => a.label.localeCompare(b.label));
}

/** What a camera's smart detection saw. */
export type CameraDetectionType = 'person' | 'animal' | 'vehicle' | 'package';

/** A smart detection happening now (`cameraDetections`). */
export interface CameraDetection {
	type: CameraDetectionType;
	/** As it's shown: "Person", "Package". */
	label: string;
}

// UniFi Protect smart detections: binary sensors that stay on while the object is in view
const DETECTION_SENSORS: { type: CameraDetectionType; label: string }[] = [
	{ type: 'person', label: 'Person' },
	{ type: 'animal', label: 'Animal' },
	{ type: 'vehicle', label: 'Vehicle' },
];
/** A package is a one-shot event (its state is when it fired), so it counts as active this long. */
export const PACKAGE_ACTIVE_MS = 2 * 60 * 1000;

/**
 * How far this device's clock may run behind Home Assistant's for a package to show. The event's
 * time is the server's, so on a panel a little behind it the event seems to fire in the future:
 * counting only past events never showed it there (and nothing re-checked once its time came).
 */
export const PACKAGE_CLOCK_SKEW_MS = 60_000;

/**
 * Smart detections happening now on the camera with this prefix: person/animal/vehicle while
 * `binary_sensor.<prefix>_<type>_detected` is on, package for PACKAGE_ACTIVE_MS after
 * `event.<prefix>_package` fires.
 */
export function cameraDetections(
	states: Record<string, HassEntity | undefined>,
	prefix: string,
	now = Date.now(),
): CameraDetection[] {
	const active: CameraDetection[] = DETECTION_SENSORS.filter(
		({ type }) => states[`binary_sensor.${prefix}_${type}_detected`]?.state === 'on',
	).map(({ type, label }) => ({ type, label }));

	const firedAt = Date.parse(states[`event.${prefix}_package`]?.state ?? '');
	const age = now - firedAt;
	if (!Number.isNaN(firedAt) && age >= -PACKAGE_CLOCK_SKEW_MS && age < PACKAGE_ACTIVE_MS) {
		active.push({ type: 'package', label: 'Package' });
	}
	return active;
}

/**
 * The URL to fetch a camera's snapshot from now, or none. Its `entity_picture` carries an access
 * token Home Assistant replaces on a restart or a reload of the camera's integration, so a panel
 * holding states from before one asked with a dead token: Home Assistant logged each as a failed
 * login (and counts it toward an IP ban). So none while the websocket is down (the states are from
 * before), none while the picture is still the one Home Assistant `rejected` (401/403), until
 * fresh states bring a new token, and none while the camera's state is still `held`: the one it had
 * when the connection dropped. A panel reconnects to a restarted Home Assistant before the new
 * states arrive, and asked with the old token in that moment.
 */
export function snapshotUrl(
	hass: Pick<HomeAssistant, 'states' | 'connection'> | null | undefined,
	entityId: string,
	rejected?: string,
	held?: HassEntity,
): string | undefined {
	if (!hass || hass.connection?.connected === false) return undefined;
	const entity = hass.states[entityId];
	if (held && entity === held) return undefined;
	const picture = entity?.attributes.entity_picture;
	return typeof picture === 'string' && picture && picture !== rejected ? picture : undefined;
}

/** Whether UniFi Protect reports the camera as recording right now (state `recording`, vs `streaming`/`idle`). */
export function isCameraRecording(entity: HassEntity | undefined): boolean {
	return entity?.state === 'recording';
}

/**
 * The camera device showing `entityId`: matched by entity, else by device (any resolution channel
 * of the device, e.g. a notification naming the high-resolution stream). `packageLens` when the
 * entity is the device's package lens, so the viewer starts with it as the main view.
 */
export function findCamera(
	cameras: CameraDevice[],
	entityId: string,
): { camera: CameraDevice; packageLens: boolean } | undefined {
	const camera =
		cameras.find((c) => c.entityId === entityId || c.pipEntityId === entityId) ??
		cameras.find((c) => c.id === cameraPrefix(entityId));
	if (!camera) return undefined;
	return { camera, packageLens: !!camera.pipEntityId && PACKAGE_SUFFIX.test(entityId) };
}

/** The camera a link asks to open: `?camera=camera.front_porch_doorbell_package_camera`. */
export function linkedCamera(search: string): string | undefined {
	const camera = new URLSearchParams(search).get('camera');
	return camera && /^camera\.[a-z0-9_]+$/.test(camera) ? camera : undefined;
}

// Doorbells talk to visitors at the door
const DOORBELL_PRESETS = ['Hello! Can I help you?', 'Please leave package by door', 'One moment, coming to door'];
// Indoor cameras talk to whoever's home
const INDOOR_PRESETS = ['Hi, just checking in', 'Please call me', 'On my way home'];
// Cameras whose spot calls for their own (by device prefix)
const CAMERA_PRESETS: Record<string, string[]> = {
	// Faces the couch, with the kitchen and stairs behind: family at home, usually from away
	living_room_living_room: ['Hi, just checking in', "Dinner's ready", 'Please call me', 'On my way home'],
};

/**
 * Talkback messages for the camera's speaker, fitting where it is: its own when listed, else a
 * doorbell's for visitors (a doorbell id or package lens), else an indoor camera's for the family.
 * In a holiday's days its lines lead (a doorbell's for trick-or-treaters, an indoor one's for family).
 */
export function talkbackPresets(
	camera: Pick<CameraDevice, 'id' | 'pipEntityId'>,
	holiday?: HolidayId | null,
): string[] {
	const own = CAMERA_PRESETS[camera.id];
	const doorbell = !own && (camera.id.includes('doorbell') || !!camera.pipEntityId);
	const presets = own ?? (doorbell ? DOORBELL_PRESETS : INDOOR_PRESETS);
	if (!holiday) return presets;
	const { doorbell: atDoor, indoor } = HOLIDAY_MESSAGES[holiday];
	return [...(doorbell ? atDoor : indoor), ...presets];
}
