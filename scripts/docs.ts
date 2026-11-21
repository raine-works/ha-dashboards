// docs/reference/: the pages that list what the code defines (the modules, the integration's
// options and actions), written from the code so they can't drift. `bun scripts/docs.ts` writes
// them; docs.test.ts fails when a page and the code disagree.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULES } from '../packages/ui/src/lib/modules';

const root = resolve(import.meta.dir, '..');
const integration = resolve(root, 'custom_components/raineworks_dashboards');
export const REFERENCE = resolve(root, 'docs/reference');

type Strings = {
	options: { step: Record<string, StepStrings> };
	config_subentries: Record<string, { step: Record<string, StepStrings> }>;
	services: Record<string, { name: string; description: string; fields?: Record<string, FieldStrings> }>;
};
type StepStrings = {
	title?: string;
	description?: string;
	data?: Record<string, string>;
	data_description?: Record<string, string>;
	menu_options?: Record<string, string>;
};
type FieldStrings = { name: string; description: string };
type ServiceYaml = Record<string, { fields?: Record<string, { required?: boolean; default?: unknown }> } | null>;

const HEADER = (what: string) =>
	`<!-- Written by scripts/docs.ts from ${what}: edit that, then run \`bun scripts/docs.ts\`. -->\n\n`;

/** A Markdown table cell: one line, pipes escaped. */
const cell = (text: unknown) =>
	String(text ?? '')
		.replace(/\s*\n\s*/g, ' ')
		.replace(/\|/g, '\\|');

const table = (head: string[], rows: unknown[][]) =>
	[
		`| ${head.join(' | ')} |`,
		`| ${head.map(() => ':---').join(' | ')} |`,
		...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
	].join('\n');

const strings = (): Strings => JSON.parse(readFileSync(resolve(integration, 'strings.json'), 'utf8')) as Strings;

function modulesPage(): string {
	return `${HEADER('packages/ui/src/lib/modules.ts')}# Modules

Every feature is a module. A module is **on** when your house has what it needs and you haven't
turned it off, **missing** when something it needs isn't there, and **off** when you turned it off.
Missing and off modules leave no trace in the dashboards.

Turn one off in a card's \`house\` option:

\`\`\`yaml
house:
  modules:
    holidays: false
\`\`\`

\`bun run report\` shows which modules a Home Assistant has.

${table(
	['Module', 'Id', 'What it shows', 'What it needs'],
	MODULES.map((m) => [m.name, `\`${m.id}\``, m.description, m.needs]),
)}
`;
}

function optionsPage(): string {
	const s = strings();
	const menu = Object.keys(s.options.step.init?.menu_options ?? {});
	const sections = menu.map((key) => {
		const step = s.options.step[key] ?? {};
		const fields = Object.entries(step.data ?? {});
		return `## ${step.title ?? key}

${step.description ? `${step.description}\n\n` : ''}${table(
	['Option', 'Key', 'What it does'],
	fields.map(([id, label]) => [label, `\`${id}\``, step.data_description?.[id] ?? '']),
)}`;
	});
	const panel = s.config_subentries.wall_panel?.step.user ?? {};
	return `${HEADER('custom_components/raineworks_dashboards/strings.json')}# Integration options

Settings → Devices & services → Raineworks Dashboards → **Configure**. A card's \`house\` option
in YAML wins over these key by key.

${sections.join('\n\n')}

## Wall panels

**Add wall panel** on the integration's page, once per tablet.

${panel.description ? `${panel.description}\n\n` : ''}${table(
	['Setting', 'Key', 'What it does'],
	Object.entries(panel.data ?? {}).map(([id, label]) => [label, `\`${id}\``, panel.data_description?.[id] ?? '']),
)}
`;
}

function actionsPage(): string {
	const s = strings();
	const yaml = Bun.YAML.parse(readFileSync(resolve(integration, 'services.yaml'), 'utf8')) as ServiceYaml;
	const sections = Object.keys(yaml)
		.sort()
		.map((id) => {
			const text = s.services[id];
			const fields = Object.entries(yaml[id]?.fields ?? {});
			const rows = fields.map(([field, spec]) => [
				`\`${field}\``,
				spec.required ? 'yes' : '',
				spec.default === undefined ? '' : `\`${JSON.stringify(spec.default)}\``,
				text?.fields?.[field]?.description ?? '',
			]);
			return `## \`raineworks_dashboards.${id}\`

${text?.description ?? ''}${rows.length ? `\n\n${table(['Field', 'Required', 'Default', 'What it is'], rows)}` : ''}`;
		});
	return `${HEADER('custom_components/raineworks_dashboards/services.yaml and strings.json')}# Actions

The integration's actions, for automations, scripts and Assist.

${sections.join('\n\n')}
`;
}

/** Every reference page: its file name under docs/reference, and its content. */
export function referencePages(): Record<string, string> {
	return { 'modules.md': modulesPage(), 'options.md': optionsPage(), 'actions.md': actionsPage() };
}

if (import.meta.main) {
	for (const [name, content] of Object.entries(referencePages())) {
		await Bun.write(resolve(REFERENCE, name), content);
		console.log(`docs/reference/${name}`);
	}
}
