// House audit (`bun run audit:house`): every place the dashboards' source assumes this house, the
// burn-down list for open-sourcing them. Walks the string literals of packages/*/src (tests left
// out) with TypeScript's own parser, so comments and service names never count, and reports:
// - house entities: a literal entity id (`media_player.kitchen_kitchen`), which has to become
//   discovery or a config option
// - product entities: the scripts and helpers the dashboards ship with (`script.play_announcement`,
//   `input_text.lock_faults`), which the raineworks_dashboards integration is to own
// - personal terms: names and places from `.house-terms` (gitignored, one per line, so the list
//   itself never reaches the public repo), in code and in comments
// A literal that's a discovery convention (`calendar.birthdays*`) carries `// house-audit: discovery`
// on its line or the one above. `--strict` exits 1 while any house entity or personal term is left.
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { Glob } from 'bun';
import ts from 'typescript';

const root = resolve(import.meta.dir, '..');
const strict = process.argv.includes('--strict');

/** Domains whose `<domain>.<object>` literals name entities (and services, told apart below). */
const DOMAINS = [
	'alarm_control_panel',
	'binary_sensor',
	'button',
	'calendar',
	'camera',
	'climate',
	'cover',
	'event',
	'fan',
	'image',
	'input_boolean',
	'input_datetime',
	'input_number',
	'input_select',
	'input_text',
	'light',
	'lock',
	'media_player',
	'notify',
	'number',
	'person',
	'remote',
	'scene',
	'script',
	'select',
	'sensor',
	'switch',
	'todo',
	'tts',
	'vacuum',
	'weather',
	'zone',
];
const ENTITY = new RegExp(`^(${DOMAINS.join('|')})\\.([a-z0-9_]+)$`);

/** Service names, never entities: `light.turn_off`, `media_player.volume_set`, `tts.speak`. */
const SERVICE =
	/^(turn_on|turn_off|toggle|reload|press|lock|unlock|open|speak|start|stop|pause|join|unjoin|oscillate|dismiss|dismiss_all|send_command|play_media|shuffle_set|repeat_set|clear_playlist|add_item|update_item|remove_item|remove_completed_items|arm|disarm|(open|close|stop)_cover|set_.+|select_.+|media_.+|volume_.+|get_.+|clear_.+|alarm_.+|return_to_base)$/;

/**
 * What the dashboards ship with: the HA package's scripts and helpers. Their names are the
 * product's, not the house's; the integration (phase 3) takes them over.
 */
/** Home Assistant's own entities, the same in every house. */
const STANDARD = /^(zone\.home|sun\.sun)$/;

const PRODUCT = [
	/^script\./,
	/^input_text\.(lock_faults|daily_affirmation_)$/,
	/^input_select\.thermostat_preset$/,
	/^sensor\.(daily_brief|holiday|alarm_change_source)$/,
];

/** Marks a literal that's a discovery convention, the same in any house, not this house's entity. */
const DISCOVERY = 'house-audit: discovery';

type Kind = 'house' | 'product' | 'term';
interface Finding {
	kind: Kind;
	file: string;
	line: number;
	text: string;
}

const termsFile = resolve(root, '.house-terms');
const terms = existsSync(termsFile)
	? readFileSync(termsFile, 'utf8')
			.split('\n')
			.map((t) => t.trim())
			.filter((t) => t && !t.startsWith('#'))
	: [];
const termPattern = terms.length
	? // The org's name (raine-works, Raineworks TV) is the project's, not the house's
		new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b(?!-works)`, 'i')
	: null;

const findings: Finding[] = [];
// Tests and the demo house (packages/demo) name made-up entities on purpose
const isTest = (path: string) =>
	path.includes('/__tests__/') || /\.test\.tsx?$/.test(path) || path.includes('/packages/demo/');

for (const pattern of ['packages/*/src/**/*.{ts,tsx}', 'packages/*/scripts/**/*.ts']) {
	for await (const path of new Glob(pattern).scan({ cwd: root, absolute: true })) {
		if (isTest(path)) continue;
		const file = relative(root, path);
		const source = readFileSync(path, 'utf8');
		const lines = source.split('\n');
		const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
		const at = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

		const literal = (text: string, pos: number) => {
			// A template's head (`input_text.daily_affirmation_${…}`) names an entity family
			const id = text.trim();
			const match = ENTITY.exec(id);
			if (!match || SERVICE.test(match[2]) || STANDARD.test(id)) return;
			// A naming convention discovery looks for (`calendar.birthdays*`), marked on its line or the one above
			const line = at(pos);
			if (lines[line - 1]?.includes(DISCOVERY) || lines[line - 2]?.includes(DISCOVERY)) return;
			findings.push({
				kind: PRODUCT.some((p) => p.test(id)) ? 'product' : 'house',
				file,
				line: at(pos),
				text: id,
			});
		};
		const visit = (node: ts.Node) => {
			// callService('script', 'notify_people', …) and callForResponse(hass, 'script', 'daily_scripture') name a script
			// without its entity id
			if (ts.isCallExpression(node)) {
				const args = node.arguments;
				const callee = node.expression.getText(sf);
				args.forEach((arg, i) => {
					if (!ts.isStringLiteralLike(arg)) return;
					const prev = args[i - 1];
					const afterScript = prev && ts.isStringLiteralLike(prev) && prev.text === 'script';
					if (afterScript || (/callScript$/.test(callee) && i === 1)) literal(`script.${arg.text}`, arg.getStart());
				});
			}
			if (ts.isStringLiteralLike(node)) literal(node.text, node.getStart());
			else if (ts.isTemplateExpression(node)) literal(node.head.text, node.getStart());
			ts.forEachChild(node, visit);
		};
		visit(sf);

		if (termPattern)
			source.split('\n').forEach((text, i) => {
				const hit = termPattern.exec(text);
				if (hit) findings.push({ kind: 'term', file, line: i + 1, text: text.trim().slice(0, 120) });
			});
	}
}

const TITLES: Record<Kind, string> = {
	house: 'House entities (to discovery or config)',
	product: 'Product entities (the integration takes them over)',
	term: 'Personal terms (from .house-terms)',
};
for (const kind of ['house', 'product', 'term'] as Kind[]) {
	const list = findings.filter((f) => f.kind === kind).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
	console.log(`\n${TITLES[kind]}: ${list.length}`);
	for (const f of list) console.log(`  ${f.file}:${f.line}  ${f.text}`);
}
if (!termPattern) console.log('\n(no .house-terms file: personal terms not checked)');

const left = findings.filter((f) => f.kind !== 'product').length;
if (strict && left) {
	console.error(`\n${left} house-specific references left`);
	process.exit(1);
}
