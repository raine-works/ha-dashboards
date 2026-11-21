import { describe, expect, it } from 'bun:test';
import type { HomeAssistantConnection } from '@app/ha-client';
import { createServer, PROTOCOL_VERSION } from '../server';
import { checkHouse, dashboardConfig, setupTools, type unlabeledLights } from '../tools';

/** A made-up Home Assistant answering the commands the tools send; records every call. */
function fakeHass(answers: Record<string, unknown>) {
	const calls: Record<string, unknown>[] = [];
	const connect = async (): Promise<HomeAssistantConnection> => ({
		call: async <T>(message: Record<string, unknown>) => {
			calls.push(message);
			const answer = answers[String(message.type)];
			return (typeof answer === 'function' ? answer(message) : (answer ?? [])) as T;
		},
		close: () => {},
	});
	return { calls, connect };
}

const snapshotAnswers = {
	get_states: [
		{ entity_id: 'light.lamp', state: 'off', attributes: { friendly_name: 'Lamp' } },
		{ entity_id: 'light.panel_led', state: 'on', attributes: { friendly_name: 'Panel LED' } },
		{ entity_id: 'light.ceiling', state: 'on', attributes: { friendly_name: 'Ceiling' } },
	],
	'config/entity_registry/list': [
		{ entity_id: 'light.lamp', area_id: 'den', labels: [] },
		{ entity_id: 'light.panel_led', area_id: 'hall', labels: [] },
		{ entity_id: 'light.ceiling', area_id: 'den', labels: ['household_light'] },
	],
	'config/area_registry/list': [
		{ area_id: 'den', name: 'Den', floor_id: 'main' },
		{ area_id: 'hall', name: 'Hall', floor_id: null },
	],
	'config/floor_registry/list': [{ floor_id: 'main', name: 'Main Floor', level: 1 }],
	get_services: {},
	get_config: { components: [], version: '2026.11.2' },
};

describe('the MCP protocol', () => {
	const tools = setupTools(fakeHass(snapshotAnswers).connect);
	const { handle } = createServer(tools, { name: 'test', version: '1' });

	it('initializes, lists tools and ignores notifications', async () => {
		const init = (await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })) as any;
		expect(init.result.protocolVersion).toBe(PROTOCOL_VERSION);
		expect(init.result.capabilities).toEqual({ tools: {} });
		expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
		const list = (await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as any;
		const names = list.result.tools.map((t: { name: string }) => t.name);
		expect(names).toContain('capability_report');
		const writer = list.result.tools.find((t: { name: string }) => t.name === 'create_dashboard');
		expect(writer.annotations.readOnlyHint).toBe(false);
	});

	it('reports a missing argument, an unknown tool and an unknown method', async () => {
		const missing = (await handle({
			id: 3,
			method: 'tools/call',
			params: { name: 'create_dashboard', arguments: {} },
		})) as any;
		expect(missing.error.code).toBe(-32602);
		const unknown = (await handle({ id: 4, method: 'tools/call', params: { name: 'nope' } })) as any;
		expect(unknown.error.code).toBe(-32602);
		expect(((await handle({ id: 5, method: 'resources/list' })) as any).error.code).toBe(-32601);
	});

	it("returns a tool's failure as an error result the assistant reads", async () => {
		const result = (await handle({
			id: 6,
			method: 'tools/call',
			params: { name: 'create_dashboard', arguments: { title: 'X', url_path: 'nohyphen', card: 'home' } },
		})) as any;
		expect(result.result.isError).toBe(true);
		expect(result.result.content[0].text).toContain('hyphen');
	});
});

describe('the setup tools', () => {
	it('finds lights without the Household Light label, flagging likely indicators', async () => {
		const { connect } = fakeHass(snapshotAnswers);
		const tool = setupTools(connect).find((t) => t.name === 'find_unlabeled_lights')!;
		const lights = JSON.parse(await tool.run({})) as ReturnType<typeof unlabeledLights>;
		expect(lights.map((l) => [l.entity_id, l.area, l.looks_like_an_indicator])).toEqual([
			['light.lamp', 'Den', false],
			['light.panel_led', 'Hall', true],
		]);
	});

	it('labels lights, creating the label once, and leaves labeled ones alone', async () => {
		const { calls, connect } = fakeHass({
			'config/label_registry/list': [],
			'config/entity_registry/get': (m: { entity_id: string }) => ({
				labels: m.entity_id === 'light.ceiling' ? ['household_light'] : [],
			}),
		});
		const tool = setupTools(connect).find((t) => t.name === 'label_household_lights')!;
		const result = JSON.parse(await tool.run({ entity_ids: ['light.lamp', 'light.ceiling'] }));
		expect(result).toEqual({ labeled: ['light.lamp'], already_labeled: ['light.ceiling'] });
		expect(calls.filter((c) => c.type === 'config/label_registry/create')).toHaveLength(1);
		expect(calls.find((c) => c.type === 'config/entity_registry/update')).toMatchObject({
			entity_id: 'light.lamp',
			labels: ['household_light'],
		});
		await expect(tool.run({ entity_ids: ['switch.fan'] })).rejects.toThrow('light.*');
	});

	it('creates a wall panel dashboard with its card', async () => {
		const { calls, connect } = fakeHass({});
		const tool = setupTools(connect).find((t) => t.name === 'create_dashboard')!;
		await tool.run({
			title: 'Kitchen',
			url_path: 'dashboard-kitchen',
			card: 'wall_panel',
			name: 'Kitchen wall panel',
			floor: 'main',
			timer: true,
		});
		expect(calls[0]).toMatchObject({
			type: 'lovelace/dashboards/create',
			url_path: 'dashboard-kitchen',
			mode: 'storage',
		});
		expect(calls[1]).toEqual({
			id: undefined,
			...calls[1],
			type: 'lovelace/config/save',
			url_path: 'dashboard-kitchen',
			config: dashboardConfig({
				type: 'custom:wall-panel-dashboard',
				name: 'Kitchen wall panel',
				floor: 'main',
				timer: true,
			}),
		});
	});

	it('says which house settings were understood', () => {
		expect(
			checkHouse('weather: weather.home\nannounce_speaker: light.not_a_speaker\nmodules:\n  holidays: false\n'),
		).toEqual({ understood: ['weather', 'modules'], ignored: ['announce_speaker'] });
	});

	it('reports modules on and missing', async () => {
		const { connect } = fakeHass(snapshotAnswers);
		const tool = setupTools(connect).find((t) => t.name === 'capability_report')!;
		const report = JSON.parse(await tool.run({}));
		expect(report.on).toContain('Lighting');
		expect(report.missing.some((m: { module: string }) => m.module === 'Alarm')).toBe(true);
	});
});
