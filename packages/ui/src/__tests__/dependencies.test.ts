import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Every npm dependency comes from the root catalog, pinned to an exact version, so all packages
// share one version of each and nothing floats on install
const root = resolve(import.meta.dir, '../../../..');
const readJson = async (path: string) => Bun.file(path).json();

const rootPackage = await readJson(join(root, 'package.json'));
const catalog: Record<string, string> = rootPackage.catalog ?? {};
const manifests = [
	['package.json', rootPackage],
	...(await Promise.all(
		readdirSync(join(root, 'packages')).map(
			async (dir) =>
				[`packages/${dir}/package.json`, await readJson(join(root, 'packages', dir, 'package.json'))] as const,
		),
	)),
] as const;
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const dependencies = manifests.flatMap(([file, manifest]) =>
	SECTIONS.flatMap((section) =>
		Object.entries((manifest[section] ?? {}) as Record<string, string>).map(([name, spec]) => ({ file, name, spec })),
	),
);

describe('dependencies', () => {
	it('come from the catalog (or the workspace)', () => {
		const stray = dependencies.filter(({ spec }) => spec !== 'catalog:' && !spec.startsWith('workspace:'));
		expect(stray).toEqual([]);
	});

	it('are all in the catalog', () => {
		const missing = dependencies.filter(({ name, spec }) => spec === 'catalog:' && !(name in catalog));
		expect(missing).toEqual([]);
	});

	it('are pinned to exact versions in the catalog', () => {
		const ranges = Object.entries(catalog).filter(([, version]) => !/^\d+\.\d+\.\d+$/.test(version));
		expect(ranges).toEqual([]);
	});
});
