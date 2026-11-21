// The capability report (`bun run report`): which dashboard modules this Home Assistant has, which
// it's missing (and what each needs), and which the house settings turn off. The same detection the
// dashboards run (packages/ui/src/lib/modules.ts), on a snapshot of the house read over the
// websocket (HA_URL, HA_TOKEN: @app/ha-client). `--house <file>` reads another house.yaml (default:
// the repo's, when there is one); `--json` prints the rows as JSON.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectHomeAssistant } from '@app/ha-client';
import { readSnapshot } from '@app/ha-client/snapshot';
import { parseHouseConfig } from '@app/ui/lib/house-config';
import { type ModuleHass, moduleReport } from '@app/ui/lib/modules';

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const houseFile = resolve(flag('--house') ?? resolve(import.meta.dir, '../house.yaml'));
const house = parseHouseConfig(existsSync(houseFile) ? Bun.YAML.parse(readFileSync(houseFile, 'utf8')) : undefined);

const ha = await connectHomeAssistant().catch((err: Error) => {
	console.error(err.message);
	process.exit(1);
});
const snapshot = await readSnapshot(ha).finally(() => ha.close());
const rows = moduleReport({ hass: snapshot as unknown as ModuleHass, house });

if (args.includes('--json')) {
	console.log(JSON.stringify(rows, null, 2));
} else {
	const mark = { on: '✓', missing: '·', off: '–' } as const;
	console.log(`${snapshot.config.location_name ?? 'Home Assistant'} (${snapshot.config.version ?? '?'})\n`);
	for (const state of ['on', 'missing', 'off'] as const) {
		const group = rows.filter((row) => row.state === state);
		if (!group.length) continue;
		console.log({ on: 'On', missing: 'Missing (what each needs)', off: 'Turned off in the house settings' }[state]);
		for (const row of group)
			console.log(`  ${mark[state]} ${row.name.padEnd(20)} ${state === 'missing' ? row.needs : row.description}`);
		console.log();
	}
}
