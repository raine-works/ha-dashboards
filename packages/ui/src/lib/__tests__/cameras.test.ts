import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	CAMERA_ACTIVITY_WATCH,
	CAMERAS_WATCH,
	cameraDetections,
	cameraPrefix,
	discoverCameras,
	findCamera,
	isCameraRecording,
	linkedCamera,
	PACKAGE_ACTIVE_MS,
	PACKAGE_CLOCK_SKEW_MS,
	snapshotUrl,
	talkbackPresets,
} from '../cameras';
import { touches } from '../hass-store';

const entity = (entity_id: string, friendly_name: string, state = 'recording'): HassEntity => ({
	entity_id,
	state,
	attributes: { friendly_name },
	last_changed: '',
	last_updated: '',
});

const toStates = (...entities: HassEntity[]) => Object.fromEntries(entities.map((e) => [e.entity_id, e]));

describe('discoverCameras', () => {
	const states = toStates(
		entity('camera.front_porch_doorbell_high_resolution_channel', 'Doorbell High resolution channel'),
		entity('camera.front_porch_doorbell_medium_resolution_channel', 'Doorbell Medium resolution channel'),
		entity('camera.front_porch_doorbell_package_camera', 'Doorbell Package Camera'),
		entity('camera.living_room_living_room_high_resolution_channel', 'G6 Instant High resolution channel'),
		entity('camera.living_room_living_room_medium_resolution_channel', 'G6 Instant Medium resolution channel'),
		entity('media_player.front_porch_doorbell_speaker', 'Doorbell Speaker'),
		entity('media_player.living_room_living_room_speaker', 'G6 Instant Speaker'),
		entity('light.kitchen', 'Kitchen'),
	);

	it('groups channels into one camera per device with the package lens as PIP', () => {
		expect(discoverCameras(states)).toEqual([
			{
				id: 'front_porch_doorbell',
				label: 'Doorbell',
				entityId: 'camera.front_porch_doorbell_medium_resolution_channel',
				pipEntityId: 'camera.front_porch_doorbell_package_camera',
				speakerEntity: 'media_player.front_porch_doorbell_speaker',
				available: true,
			},
			{
				id: 'living_room_living_room',
				label: 'G6 Instant',
				entityId: 'camera.living_room_living_room_medium_resolution_channel',
				pipEntityId: undefined,
				speakerEntity: 'media_player.living_room_living_room_speaker',
				available: true,
			},
		]);
	});

	it('falls back to the high channel and keeps non-Protect cameras as-is', () => {
		const cameras = discoverCameras(
			toStates(
				entity('camera.garage_high_resolution_channel', 'Garage High resolution channel', 'unavailable'),
				entity('camera.backyard', 'Backyard'),
			),
		);
		expect(cameras.map((c) => [c.label, c.entityId, c.available, c.speakerEntity])).toEqual([
			['Backyard', 'camera.backyard', true, undefined],
			['Garage', 'camera.garage_high_resolution_channel', false, undefined],
		]);
	});

	it('skips a channel turned off in Protect for one that streams', () => {
		const [doorbell] = discoverCameras(
			toStates(
				entity('camera.front_porch_doorbell_high_resolution_channel', 'Doorbell High resolution channel'),
				entity(
					'camera.front_porch_doorbell_medium_resolution_channel',
					'Doorbell Medium resolution channel',
					'unavailable',
				),
			),
		);
		expect([doorbell.entityId, doorbell.available]).toEqual([
			'camera.front_porch_doorbell_high_resolution_channel',
			true,
		]);
	});

	it('prefers the secure channel over the insecure one', () => {
		const cameras = discoverCameras(
			toStates(
				entity('camera.porch_medium_resolution_channel_insecure', 'Porch Medium resolution channel (insecure)'),
				entity('camera.porch_medium_resolution_channel', 'Porch Medium resolution channel'),
			),
		);
		expect(cameras[0].entityId).toBe('camera.porch_medium_resolution_channel');
	});
});

describe('cameraPrefix', () => {
	it('strips the domain and the channel or package suffix', () => {
		expect(cameraPrefix('camera.living_room_living_room_medium_resolution_channel')).toBe('living_room_living_room');
		expect(cameraPrefix('camera.front_porch_doorbell_high_resolution_channel_insecure')).toBe('front_porch_doorbell');
		expect(cameraPrefix('camera.front_porch_doorbell_package_camera')).toBe('front_porch_doorbell');
		expect(cameraPrefix('camera.garage')).toBe('garage');
	});
});

describe('cameraDetections', () => {
	const state = (entity_id: string, value: string): HassEntity => ({
		entity_id,
		state: value,
		attributes: {},
		last_changed: '',
		last_updated: '',
	});
	const now = Date.parse('2026-10-18T20:00:00Z');

	it('lists person, animal and vehicle while their sensors are on', () => {
		const states = {
			'binary_sensor.porch_person_detected': state('binary_sensor.porch_person_detected', 'on'),
			'binary_sensor.porch_animal_detected': state('binary_sensor.porch_animal_detected', 'off'),
			'binary_sensor.porch_vehicle_detected': state('binary_sensor.porch_vehicle_detected', 'on'),
			'binary_sensor.yard_animal_detected': state('binary_sensor.yard_animal_detected', 'on'),
		};
		expect(cameraDetections(states, 'porch', now).map((d) => d.type)).toEqual(['person', 'vehicle']);
	});

	it('keeps a package active for a while after the event fires', () => {
		const fired = (msAgo: number) => ({
			'event.porch_package': state('event.porch_package', new Date(now - msAgo).toISOString()),
		});
		expect(cameraDetections(fired(30_000), 'porch', now)).toEqual([{ type: 'package', label: 'Package' }]);
		expect(cameraDetections(fired(PACKAGE_ACTIVE_MS + 1), 'porch', now)).toEqual([]);
		// Fired "in the future": this device's clock is a little behind Home Assistant's
		expect(cameraDetections(fired(-5_000), 'porch', now)).toEqual([{ type: 'package', label: 'Package' }]);
		expect(cameraDetections(fired(-PACKAGE_CLOCK_SKEW_MS - 1), 'porch', now)).toEqual([]);
		expect(cameraDetections({ 'event.porch_package': state('event.porch_package', 'unknown') }, 'porch', now)).toEqual(
			[],
		);
	});
});

describe('isCameraRecording', () => {
	it('is true only in the recording state', () => {
		const cam = (value: string): HassEntity => ({
			entity_id: 'camera.porch',
			state: value,
			attributes: {},
			last_changed: '',
			last_updated: '',
		});
		expect(isCameraRecording(cam('recording'))).toBe(true);
		expect(isCameraRecording(cam('streaming'))).toBe(false);
		expect(isCameraRecording(undefined)).toBe(false);
	});
});

describe('findCamera', () => {
	const cameras = discoverCameras(
		toStates(
			entity('camera.front_porch_doorbell_high_resolution_channel', 'Front Porch Doorbell High'),
			entity('camera.front_porch_doorbell_medium_resolution_channel', 'Front Porch Doorbell Medium'),
			entity('camera.front_porch_doorbell_package_camera', 'Front Porch Doorbell Package'),
			entity('camera.garage_medium_resolution_channel', 'Garage Medium'),
		),
	);

	it("finds a device by any of its streams (a notification's high-resolution one)", () => {
		const found = findCamera(cameras, 'camera.front_porch_doorbell_high_resolution_channel');
		expect(found?.camera.id).toBe('front_porch_doorbell');
		expect(found?.packageLens).toBe(false);
	});

	it('opens the package lens as the main view', () => {
		const found = findCamera(cameras, 'camera.front_porch_doorbell_package_camera');
		expect(found?.camera.id).toBe('front_porch_doorbell');
		expect(found?.packageLens).toBe(true);
	});

	it('finds nothing for an unknown camera', () => {
		expect(findCamera(cameras, 'camera.attic_medium_resolution_channel')).toBeUndefined();
	});
});

describe('linkedCamera', () => {
	it('reads a camera entity from the link', () => {
		expect(linkedCamera('?camera=camera.front_porch_doorbell_package_camera')).toBe(
			'camera.front_porch_doorbell_package_camera',
		);
		expect(linkedCamera('?edit=1&camera=camera.garage_medium_resolution_channel')).toBe(
			'camera.garage_medium_resolution_channel',
		);
	});

	it('ignores links without a camera, or with anything else in it', () => {
		expect(linkedCamera('')).toBeUndefined();
		expect(linkedCamera('?camera=light.kitchen')).toBeUndefined();
		expect(linkedCamera('?camera=camera.x<script>')).toBeUndefined();
	});
});

describe('talkbackPresets', () => {
	it('gives the living room camera messages for the family', () => {
		const presets = talkbackPresets({ id: 'living_room_living_room' });
		expect(presets).toContain("Dinner's ready");
		expect(presets).not.toContain('Please leave package by door');
	});

	it('gives doorbells messages for visitors', () => {
		expect(talkbackPresets({ id: 'front_porch_doorbell' })).toContain('Please leave package by door');
		expect(talkbackPresets({ id: 'side_gate', pipEntityId: 'camera.side_gate_package_camera' })).toContain(
			'Please leave package by door',
		);
	});

	it('gives other cameras indoor messages', () => {
		expect(talkbackPresets({ id: 'basement_g4_instant' })).not.toContain('Please leave package by door');
	});
});

describe('camera watches', () => {
	const changes = (...ids: string[]) => new Set(ids);

	it('discovery wakes for cameras and their talkback speakers only', () => {
		expect(touches(changes('camera.front_porch_doorbell_medium_resolution_channel'), CAMERAS_WATCH)).toBe(true);
		expect(touches(changes('media_player.front_porch_doorbell_speaker'), CAMERAS_WATCH)).toBe(true);
		expect(touches(changes('media_player.kitchen_kitchen'), CAMERAS_WATCH)).toBe(false);
		expect(touches(changes('binary_sensor.front_porch_doorbell_person_detected'), CAMERAS_WATCH)).toBe(false);
	});

	it('activity wakes for cameras, smart detections and package events only', () => {
		for (const id of [
			'camera.driveway_medium_resolution_channel',
			'binary_sensor.driveway_person_detected',
			'binary_sensor.driveway_animal_detected',
			'binary_sensor.driveway_vehicle_detected',
			'event.front_porch_doorbell_package',
		])
			expect(touches(changes(id), CAMERA_ACTIVITY_WATCH)).toBe(true);
		for (const id of [
			'binary_sensor.hallway_motion',
			'binary_sensor.driveway_motion',
			'event.front_porch_doorbell_ring',
			'media_player.front_porch_doorbell_speaker',
		])
			expect(touches(changes(id), CAMERA_ACTIVITY_WATCH)).toBe(false);
	});
});

describe('snapshotUrl', () => {
	const camera = 'camera.front_porch_doorbell_high_resolution_channel';
	const picture = `/api/camera_proxy/${camera}?token=new`;
	const states = {
		[camera]: { ...entity(camera, 'Doorbell'), attributes: { entity_picture: picture } },
	};

	it('fetches the picture while connected', () => {
		expect(snapshotUrl({ states, connection: { connected: true } as never }, camera)).toBe(picture);
		// No connection object (tests, a page before it connects): the states are all there is
		expect(snapshotUrl({ states }, camera)).toBe(picture);
	});

	it('waits while the websocket is down: the token may be from before a restart', () => {
		expect(snapshotUrl({ states, connection: { connected: false } as never }, camera)).toBeUndefined();
	});

	it('never asks again with a token Home Assistant refused, until a new one arrives', () => {
		expect(snapshotUrl({ states }, camera, picture)).toBeUndefined();
		expect(snapshotUrl({ states }, camera, `/api/camera_proxy/${camera}?token=old`)).toBe(picture);
	});

	it('has none for a camera without a picture or not there', () => {
		expect(snapshotUrl({ states }, 'camera.gone')).toBeUndefined();
		expect(snapshotUrl(undefined, camera)).toBeUndefined();
	});
});
