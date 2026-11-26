/**
 * The section cards' definitions: tag, component, and what Home Assistant's card picker and sections
 * view are told (name, description, size, a new card's YAML). Registered by the bundle (`src/index.tsx`).
 *
 * @module
 */

import type { PanelElementOptions } from '@app/ui/panel';
import { CamerasSectionCard, ClimateCard, HeaderCard, LightingCard, MusicCard, SecurityCard } from './SectionCards';

/** A section card's definition (its styles key added by the bundle). */
export type SectionCardDefinition = Omit<PanelElementOptions, 'stylesKey'> &
	Required<Pick<PanelElementOptions, 'card'>>;

/** Every section card, in the card picker's order. */
export const SECTION_CARDS: SectionCardDefinition[] = [
	{
		tag: 'raineworks-header',
		component: HeaderCard,
		cardSize: 3,
		card: {
			name: 'Raineworks Header',
			description:
				"The clock, weather, who's home and what the house is doing, with the daily brief, messages, to-dos and TVs a tap away",
		},
	},
	{
		tag: 'raineworks-lighting',
		component: LightingCard,
		card: {
			name: 'Raineworks Lighting',
			description: 'Every light and scene by floor and room, with dimmers, colors and All off',
		},
	},
	{
		tag: 'raineworks-security',
		component: SecurityCard,
		card: {
			name: 'Raineworks Security',
			description: 'The alarm, locks with their doors, garage doors and the cameras',
		},
	},
	{
		tag: 'raineworks-climate',
		component: ClimateCard,
		card: {
			name: 'Raineworks Climate',
			description: 'Thermostats, scent diffusers, curtains and blinds, and fans',
		},
	},
	{
		tag: 'raineworks-music',
		component: MusicCard,
		card: {
			name: 'Raineworks Music',
			description: 'Music Assistant: now playing, browse and search, the queue and speaker groups',
		},
	},
	{
		tag: 'raineworks-cameras',
		component: CamerasSectionCard,
		card: {
			name: 'Raineworks Cameras',
			description: "Every camera's snapshot, each opening its live view and clips",
		},
	},
];
