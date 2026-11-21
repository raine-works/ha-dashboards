import { describe, expect, it } from 'bun:test';
import { bundleFile, versionUrl } from '../bundle';

describe('bundleFile', () => {
	it('names the deployed bundle a module was loaded from', () => {
		expect(bundleFile('https://ha.example.com/local/ha-dashboards/dashboards-46b020252384.js')).toBe(
			'dashboards-46b020252384.js',
		);
		expect(bundleFile('https://ha.example/local/ha-dashboards/dashboards-46b020252384.js?v=1')).toBe(
			'dashboards-46b020252384.js',
		);
	});

	it('is null anywhere else (a local or test build, an inline bundle)', () => {
		expect(bundleFile('file:///tmp/dashboards.js')).toBeNull();
		expect(bundleFile('data:text/javascript;base64,AAAA')).toBeNull();
		expect(bundleFile(undefined)).toBeNull();
	});
});

describe('versionUrl', () => {
	it('is version.json beside the bundle, wherever it is served', () => {
		expect(versionUrl('https://ha.example.com/local/ha-dashboards/dashboards-46b020252384.js')).toBe(
			'https://ha.example.com/local/ha-dashboards/version.json',
		);
		expect(versionUrl('https://ha.example.com/raineworks_dashboards/dashboards-46b020252384.js')).toBe(
			'https://ha.example.com/raineworks_dashboards/version.json',
		);
		expect(versionUrl('file:///tmp/dashboards.js')).toBeNull();
	});
});
