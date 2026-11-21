import type { PanelElementOptions } from '@app/ui/panel';
import { WallPanel } from './WallPanel';

/**
 * The wall panel card (`custom:wall-panel-dashboard`), registered by the dashboards bundle
 * (`src/index.tsx`). Its YAML names the panel and its floor:
 *
 *   - type: custom:wall-panel-dashboard
 *     name: Kitchen wall panel   # who armed or disarmed the alarm, where the shared user can't say
 *     floor: main_floor          # its lights first
 *     timer: true                # a countdown timer in the header
 */
export const wallPanel: Omit<PanelElementOptions, 'stylesKey'> = {
	tag: 'wall-panel-dashboard',
	component: WallPanel,
	// Always dark on the wall (auto would follow the panel user's theme mode); `color_scheme` overrides it
	colorScheme: 'dark',
	// A wall panel fits the screen: lists scroll inside their sections, never the page
	fillViewport: true,
	// A shared tablet: no personal-device features (saving a camera clip), touch-sized controls, and
	// its name (the card's `name`) where the shared user can't say which panel it was
	wallPanel: true,
	// The house's first panels' own cards, before this one: still registered, so a dashboard that
	// names one keeps working (its options come from its YAML like this card's)
	aliases: [
		'kitchen-dashboard',
		'basement-dashboard',
		'hallway-dashboard',
		'kitchen-wall-panel',
		'basement-wall-panel',
		'hallway-wall-panel',
	],
};
