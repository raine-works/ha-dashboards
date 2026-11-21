import { describe, expect, it, spyOn } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { changedEntities, createHassStore, deepEqual, pickStates, touches, waitForHass } from '../hass-store';

const entity = (entity_id: string, state = 'on'): HassEntity => ({
	entity_id,
	state,
	attributes: {},
	last_changed: '',
	last_updated: '',
});

const base = { callService: async () => {}, entities: {}, themes: { darkMode: true } };
const hass = (states: Record<string, HassEntity>, extra: Partial<HomeAssistant> = {}) =>
	({ ...base, states, ...extra }) as HomeAssistant;

describe('changedEntities', () => {
	const light = entity('light.desk');
	const cpu = entity('sensor.cpu', '10');
	const prev = hass({ 'light.desk': light, 'sensor.cpu': cpu });

	it('lists the entities Home Assistant replaced', () => {
		const next = hass({ 'light.desk': light, 'sensor.cpu': entity('sensor.cpu', '11') });
		expect(changedEntities(prev, next)).toEqual(new Set(['sensor.cpu']));
	});

	it('includes added and removed entities', () => {
		const next = hass({ 'sensor.cpu': cpu, 'switch.fan': entity('switch.fan') });
		expect(changedEntities(prev, next)).toEqual(new Set(['switch.fan', 'light.desk']));
	});

	it('is null when anything besides states changed, or there was no hass before', () => {
		expect(changedEntities(prev, hass(prev.states, { entities: {} }))).toBeNull();
		expect(changedEntities(null, prev)).toBeNull();
	});
});

describe('touches', () => {
	const changed = new Set(['sensor.cpu']);
	it('matches domains or an entity id test', () => {
		expect(touches(changed, ['light', 'switch'])).toBe(false);
		expect(touches(changed, ['sensor'])).toBe(true);
		expect(touches(changed, (id) => id.endsWith('_cpu'))).toBe(false);
	});
	it('runs selectors without a watch, and on every selector when anything may have changed', () => {
		expect(touches(changed, undefined)).toBe(true);
		expect(touches(null, [])).toBe(true);
	});
});

describe('createHassStore', () => {
	it('notifies subscribers of a new hass, with what changed', () => {
		const first = hass({ 'light.desk': entity('light.desk') });
		const store = createHassStore(first);
		const seen: (ReadonlySet<string> | null)[] = [];
		const unsubscribe = store.subscribe(() => seen.push(store.changed()));
		store.set(first); // same object: no update
		store.set(hass({ 'light.desk': entity('light.desk', 'off') }));
		unsubscribe();
		store.set(null);
		expect(seen).toEqual([new Set(['light.desk'])]);
	});

	it('still notifies later subscribers when one throws', () => {
		const store = createHassStore(null);
		const error = spyOn(console, 'error').mockImplementation(() => {});
		let notified = 0;
		store.subscribe(() => {
			throw new Error('boom');
		});
		store.subscribe(() => notified++);
		store.set(hass({ 'light.desk': entity('light.desk') }));
		expect(notified).toBe(1);
		expect(error).toHaveBeenCalledTimes(1);
		error.mockRestore();
	});
});

describe('deepEqual', () => {
	it('compares plain data structurally', () => {
		expect(deepEqual({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true);
		expect(deepEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
		expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
		expect(deepEqual([1], { 0: 1 })).toBe(false);
		expect(deepEqual(new Date(5), new Date(5))).toBe(true);
	});
	it('compares class instances (Maps, Sets) by identity', () => {
		expect(deepEqual(new Set([1]), new Set([1]))).toBe(false);
	});
});

describe('pickStates', () => {
	it('keeps the states whose id passes', () => {
		const light = entity('light.desk');
		expect(
			pickStates({ 'light.desk': light, 'sensor.cpu': entity('sensor.cpu') }, (id) => id.startsWith('light.')),
		).toEqual({
			'light.desk': light,
		});
		expect(pickStates(undefined, () => true)).toEqual({});
	});
});

describe('waitForHass', () => {
	it('resolves true once a state update satisfies the test', async () => {
		const store = createHassStore(hass({ 'light.desk': entity('light.desk', 'off') }));
		const done = waitForHass(store, (h) => h.states['light.desk']?.state === 'on', 1000);
		store.set(hass({ 'light.desk': entity('light.desk', 'on') }));
		expect(await done).toBe(true);
	});

	it('resolves at once when it already holds, and false after the timeout', async () => {
		const store = createHassStore(hass({ 'light.desk': entity('light.desk', 'on') }));
		expect(await waitForHass(store, (h) => h.states['light.desk']?.state === 'on', 1000)).toBe(true);
		expect(await waitForHass(store, (h) => h.states['light.desk']?.state === 'off', 20)).toBe(false);
	});
});
