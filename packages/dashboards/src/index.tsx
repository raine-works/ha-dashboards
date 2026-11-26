/**
 * The bundle's entry: registers every dashboard's card (each in its own folder: home, wall-panel) and
 * the section cards (sections/: each part of them as a card of its own, for Home Assistant's sections
 * view). Which one a device shows, and a wall panel's name and floor, come from its dashboard's YAML
 * (dashboards/<name>.yaml). Home Assistant loads every Lovelace resource on every dashboard, so
 * four bundles meant four copies of the same code (~3.8MB) on every page; this is one.
 */

import { definePanelElement } from '@app/ui/panel';
import { homePanel } from './home/panel';
import { SECTION_CARDS } from './sections/cards';
import { wallPanel } from './wall-panel/panel';
import './styles.css';

const PANELS = [homePanel, wallPanel, ...SECTION_CARDS];

for (const panel of PANELS) definePanelElement({ ...panel, stylesKey: 'dashboards' });

console.info(
	'%c HA-DASHBOARDS %c Loaded: %s ',
	'color: #000; background: #22c55e; font-weight: bold; border-radius: 4px;',
	'color: #fff; background: #1f2937; border-radius: 4px;',
	PANELS.map((p) => p.tag).join(', '),
);
