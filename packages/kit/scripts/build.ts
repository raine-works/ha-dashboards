/**
 * Builds the published package into dist/: the house module and the setup MCP, each one file with
 * the workspace code it uses bundled in (the package has no dependencies), and the house module's types.
 */

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: [resolve(root, 'src/house.ts'), resolve(root, 'src/mcp.ts')],
	outdir: dist,
	target: 'bun',
	format: 'esm',
});
if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

// The house module's types, with the library files they come from (relative imports, so they resolve in dist/types)
const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', resolve(root, 'tsconfig.build.json')], {
	stdout: 'inherit',
	stderr: 'inherit',
});
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);
console.log(`Built ${result.outputs.map((o) => o.path.replace(`${root}/`, '')).join(', ')} and its types`);
