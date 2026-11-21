import { blue, green, orange, rose, violet } from './presets/colors';
import { neutral } from './presets/neutral';
import { raineworks } from './presets/raineworks';
import type { DashboardTheme } from './tokens';

export type { DashboardTheme, ThemeEffects, TokenName, Tokens } from './tokens';
export { TOKEN_NAMES } from './tokens';

/** The themes every house has, Raineworks (the default) first. */
export const PRESET_THEMES: readonly DashboardTheme[] = [raineworks, neutral, blue, green, orange, rose, violet];

export const DEFAULT_THEME_ID = 'raineworks';

/** A theme's name in Home Assistant's theme list (Profile → Theme): `Raineworks`, `Raineworks Blue`. */
export const haThemeName = (theme: Pick<DashboardTheme, 'id' | 'name'>) =>
	theme.id === 'raineworks' ? 'Raineworks' : `Raineworks ${theme.name}`;
