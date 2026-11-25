import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOME_ROUTINE, parseHouseConfig } from '../house';

const json = (path: string) => JSON.parse(readFileSync(resolve(import.meta.dir, path), 'utf8'));
const pkg = json('../../package.json');

describe('the npm package', () => {
	it("is released with the integration: the manifest's version", () => {
		expect(pkg.version).toBe(json('../../../../custom_components/raineworks_dashboards/manifest.json').version);
	});

	it('depends on nothing: the workspace code it uses is bundled in', () => {
		expect(pkg.dependencies).toBeUndefined();
		expect(pkg.private).toBeUndefined();
	});

	it('exports the house settings parser and the bedtime routines', () => {
		expect(parseHouseConfig({ announce_speaker: 'media_player.kitchen' }).announceSpeaker).toBe('media_player.kitchen');
		expect(HOME_ROUTINE.steps.length).toBeGreaterThan(0);
	});
});
