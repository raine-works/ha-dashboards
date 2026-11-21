// The demo page: one dashboard card on the demo house (`?card=home` by default; `?card=panel` a wall
// panel on the main floor with the timer, `?floor=upstairs` for another floor), the way Lovelace
// mounts it: setConfig with the card's options, then a new hass on every change. `?light` shows the
// light color scheme.
import { createDemoHass } from './hass';

// The dashboards bundle, served as it's built (not bundled into this page), imported as Home
// Assistant's loader resource imports it
const BUNDLE = '/dist/dashboards.js';
await import(BUNDLE);

const params = new URLSearchParams(location.search);
const panel = params.get('card') === 'panel';
const tag = panel ? 'wall-panel-dashboard' : 'home-dashboard';
const options = panel ? { name: 'Demo wall panel', floor: params.get('floor') ?? 'main_floor', timer: true } : {};

await customElements.whenDefined(tag);
const card = document.createElement(tag) as HTMLElement & {
	setConfig(config: Record<string, unknown>): void;
	hass: unknown;
};
// No house settings: what a new house sees, everything found by discovery
card.setConfig({ type: `custom:${tag}`, ...options, house: {}, ...(params.has('light') && { color_scheme: 'light' }) });
const demo = createDemoHass((hass) => {
	card.hass = hass;
});
card.hass = demo.get();
document.body.append(card);
// For trying things from the console: demo.set('binary_sensor.kitchen_window', 'off')
Object.assign(window, { demo });
