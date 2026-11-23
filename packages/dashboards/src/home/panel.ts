/** The Home dashboard's card definition: its tag, component and how it sits in Home Assistant. */

import type { PanelElementOptions } from '@app/ui/panel';
import { HomeDashboard, WIDE_QUERY } from './HomeDashboard';

/** The Home dashboard's card, registered by the dashboards bundle (`src/index.tsx`). */
export const homePanel: Omit<PanelElementOptions, 'stylesKey'> = {
	tag: 'home-dashboard',
	component: HomeDashboard,
	// Wide screens fit the window like a wall panel (each column scrolls); phones scroll the page
	fillViewport: WIDE_QUERY,
	// Its own header replaces Home Assistant's toolbar (phones show it without kiosk mode), with a
	// button for the sidebar, which stays always hidden
	hideChrome: true,
};
