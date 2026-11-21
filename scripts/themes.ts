// custom_components/raineworks_dashboards/themes.json: the preset themes as Home Assistant themes
// (packages/ui/src/themes), which the integration registers in Home Assistant at runtime.
// `bun scripts/themes.ts` writes it; themes-json.test.ts fails when it and the presets disagree.
import { resolve } from 'node:path';
import { DEFAULT_THEME_ID, haThemeName, PRESET_THEMES } from '../packages/ui/src/themes';
import { haTheme } from '../packages/ui/src/themes/ha-theme';

export const THEMES_JSON = resolve(import.meta.dir, '../custom_components/raineworks_dashboards/themes.json');

export function themesJson(): string {
	const themes = PRESET_THEMES.map((theme) => ({
		id: theme.id,
		name: theme.name,
		ha_name: haThemeName(theme),
		description: theme.description ?? '',
		theme: haTheme(theme),
	}));
	return `${JSON.stringify({ default: DEFAULT_THEME_ID, themes }, null, '\t')}\n`;
}

if (import.meta.main) {
	await Bun.write(THEMES_JSON, themesJson());
	console.log(`custom_components/raineworks_dashboards/themes.json: ${PRESET_THEMES.length} themes`);
}
