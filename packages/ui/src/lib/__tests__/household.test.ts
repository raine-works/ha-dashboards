import { afterEach, describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	houseAction,
	isHouseholdMember,
	loadHousehold,
	notifyPeopleAction,
	setHousehold,
	todoAssigneeAction,
} from '../household';
import { resolveMotion, setIntegrationMotion } from '../motion';
import { discoverPeople, householdPerson } from '../people';

const person = (id: string, userId: string, trackers: string[]) =>
	({
		entity_id: `person.${id}`,
		state: 'home',
		attributes: { friendly_name: id, user_id: userId, device_trackers: trackers },
		last_changed: '',
		last_updated: '',
	}) as HassEntity;

const states = {
	'person.alex': person('alex', 'u-alex', ['device_tracker.alex']),
	'person.sam': person('sam', 'u-sam', ['device_tracker.sam']),
	'person.admin': person('admin', 'u-admin', []),
};

afterEach(() => {
	setHousehold(null);
	setIntegrationMotion(null);
});

describe('the household', () => {
	it('is everyone with a device tracker until the integration says otherwise', () => {
		expect(discoverPeople(states).map((p) => p.entityId)).toEqual(['person.alex', 'person.sam']);
		expect(householdPerson(states, 'u-admin')).toBeUndefined();
	});

	it("is the integration's list when it gives one", () => {
		setHousehold(['person.alex', 'person.admin']);
		expect(discoverPeople(states).map((p) => p.entityId)).toEqual(['person.admin', 'person.alex']);
		expect(householdPerson(states, 'u-sam')).toBeUndefined();
		expect(householdPerson(states, 'u-admin')?.entity_id).toBe('person.admin');
		expect(isHouseholdMember({ ...states['person.alex'], entity_id: 'sensor.alex' } as HassEntity)).toBe(false);
	});

	it('is asked of the integration only when it is loaded', async () => {
		const asked: unknown[] = [];
		const callWS = async <T>(msg: Record<string, unknown>) => {
			asked.push(msg);
			return { household: ['person.sam'] } as T;
		};
		expect(await loadHousehold({ callWS, config: { components: ['person'] } })).toBe(false);
		expect(asked).toEqual([]);
		expect(await loadHousehold({ callWS, config: { components: ['raineworks_dashboards'] } })).toBe(true);
		expect(asked).toEqual([{ type: 'raineworks_dashboards/info' }]);
		expect(discoverPeople(states).map((p) => p.entityId)).toEqual(['person.sam']);
		// The same answer again changes nothing
		expect(await loadHousehold({ callWS, config: { components: ['raineworks_dashboards'] } })).toBe(false);
	});

	it("takes the integration's Animations option with it", async () => {
		const callWS = async <T>() => ({ household: [], motion: 'reduced' }) as T;
		await loadHousehold({ callWS, config: { components: ['raineworks_dashboards'] } });
		expect(resolveMotion(undefined)).toBe('reduced');
		expect(resolveMotion('full')).toBe('full');
	});

	it('stays as it was when the integration can’t answer', async () => {
		const callWS = async () => {
			throw new Error('unknown command');
		};
		expect(await loadHousehold({ callWS, config: { components: ['raineworks_dashboards'] } })).toBe(false);
		expect(discoverPeople(states)).toHaveLength(2);
	});
});

describe('notifyPeopleAction', () => {
	it("is the integration's action when it has one, else the house's script", () => {
		expect(notifyPeopleAction({ services: { raineworks_dashboards: { notify_people: {} } } })).toEqual([
			'raineworks_dashboards',
			'notify_people',
		]);
		expect(notifyPeopleAction({ services: { script: { notify_people: {} } } })).toEqual(['script', 'notify_people']);
		expect(notifyPeopleAction({})).toEqual(['script', 'notify_people']);
	});
});

describe('todoAssigneeAction', () => {
	it("is the integration's action when it has one, else the house's script", () => {
		expect(todoAssigneeAction({ services: { raineworks_dashboards: { notify_todo_assignee: {} } } })).toEqual([
			'raineworks_dashboards',
			'notify_todo_assignee',
		]);
		expect(todoAssigneeAction({})).toEqual(['script', 'notify_todo_assignee']);
	});
});

describe('houseAction', () => {
	it("is the integration's when it has that action, else the house's script", () => {
		const hass = { services: { raineworks_dashboards: { print_note: {} } } };
		expect(houseAction(hass, 'print_note')).toEqual(['raineworks_dashboards', 'print_note']);
		expect(houseAction(hass, 'print_todo_list')).toEqual(['script', 'print_todo_list']);
	});
});
