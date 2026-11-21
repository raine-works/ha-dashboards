import { describe, expect, it } from 'bun:test';
import { parseHouseConfig } from '@app/ui/lib/house-config';
import { type ModuleHass, moduleReport } from '@app/ui/lib/modules';
import { createDemoHass } from './hass';

describe('the demo house', () => {
	it('changes its states the way Home Assistant would', async () => {
		let updates = 0;
		const demo = createDemoHass(() => updates++);
		const before = demo.get();
		await before.callService('light', 'toggle', { entity_id: 'light.office_desk' });
		const after = demo.get();
		expect(after.states['light.office_desk']?.state).toBe('on');
		// A new hass with only the changed entity replaced
		expect(after).not.toBe(before);
		expect(after.states['light.kitchen_pendants']).toBe(before.states['light.kitchen_pendants']);
		await after.callService('light', 'turn_off', { label_id: 'household_light' });
		expect(
			Object.values(demo.get().states).filter((s) => s.entity_id.startsWith('light.') && s.state === 'on'),
		).toEqual([]);
		await demo.get().callService('lock', 'unlock', { entity_id: 'lock.front_door' });
		expect(demo.get().states['lock.front_door']?.state).toBe('unlocked');
		expect(updates).toBe(3);
	});

	it('has the core modules and none of the optional integrations', () => {
		const report = moduleReport({ hass: createDemoHass(() => {}).get() as ModuleHass, house: parseHouseConfig({}) });
		const on = report.filter((r) => r.state === 'on').map((r) => r.id);
		expect(on).toEqual(
			expect.arrayContaining([
				'lighting',
				'security',
				'climate',
				'covers',
				'fans',
				'weather',
				'calendar',
				'todo',
				'people',
			]),
		);
		for (const id of ['music', 'cameras', 'alarm', 'pets', 'tvs', 'daily', 'laundry'])
			expect(report.find((r) => r.id === id)?.state, id).toBe('missing');
	});
});
