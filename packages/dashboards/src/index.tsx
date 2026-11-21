import { definePanelElement } from '@app/ui/panel';
import { homePanel } from './home/panel';
import { wallPanel } from './wall-panel/panel';
import './styles.css';

// Every dashboard's card in one bundle (each in its own folder: home, wall-panel); which one a device
// shows, and a wall panel's name and floor, come from its dashboard's YAML (dashboards/<name>.yaml). Home Assistant loads every Lovelace resource on every
// dashboard, so four bundles meant four copies of the same code (~3.8MB) on every page; this is one.
const PANELS = [homePanel, wallPanel];

for (const panel of PANELS) definePanelElement({ ...panel, stylesKey: 'dashboards' });

console.info(
	'%c HA-DASHBOARDS %c Loaded: %s ',
	'color: #000; background: #22c55e; font-weight: bold; border-radius: 4px;',
	'color: #fff; background: #1f2937; border-radius: 4px;',
	PANELS.map((p) => p.tag).join(', '),
);
