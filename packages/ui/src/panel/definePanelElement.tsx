import React from 'preact/compat';
import { createRoot } from 'preact/compat/client';
import { AssistOverlay } from '../components/assist/AssistOverlay';
import { BundleUpdates } from '../components/layout/BundleUpdates';
import { ConnectionBanner } from '../components/layout/ConnectionBanner';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { TvAudioConfirm } from '../components/music/TvAudioConfirm';
import { DialogPortalContainer } from '../components/ui';
import {
	ColorSchemeContext,
	type ColorSchemeSetting,
	migrateDeviceColorScheme,
	resolveColorScheme,
} from '../context/ColorScheme';
import { HassProvider } from '../context/HassContext';
import { WallPanelContext } from '../context/WallPanel';
import { accentChromeVars, accentPanelTokens, accentSensorFor, applyVars, parseHex, rgbToOklch } from '../lib/accent';
import { createHassStore } from '../lib/hass-store';
import { setHouseConfig } from '../lib/house-config';
import { loadHousehold } from '../lib/household';
import { installTapHaptics } from '../lib/tones';
import type { HomeAssistant } from '../types/homeassistant';
import { hideToolbar, keepSidebarHidden } from './chrome';
import { ensurePanelFonts } from './fonts';

type PreactRoot = ReturnType<typeof createRoot>;

export interface PanelComponentProps {
	config: Record<string, unknown>;
}

export interface PanelElementOptions {
	/** Custom element tag. Lovelace strips the `custom:` prefix of `type: custom:<tag>` itself. */
	tag: string;
	component: React.ComponentType<PanelComponentProps>;
	/** Key under globalThis.__panelStyles where @app/dashboard-build injects this panel's CSS. */
	stylesKey: string;
	/** Lovelace layout hint. */
	cardSize?: number;
	/** Former tags, still registered so dashboards using them keep working. */
	aliases?: string[];
	/**
	 * Light or dark: `auto` (default) follows the user's Home Assistant theme mode. The card's
	 * `color_scheme` option overrides it per dashboard.
	 */
	colorScheme?: ColorSchemeSetting;
	/**
	 * Wall panels: be exactly as tall as the screen below the element's top, so the page never
	 * scrolls and a long list scrolls inside its own section. Home Assistant gives views only a
	 * min-height, so `height: 100%` alone resolves to the content's height. Off for a dashboard
	 * whose page should scroll; a media query fits only while it matches (Home fits the window
	 * on wider screens and scrolls as a page on phones).
	 */
	fillViewport?: boolean | string;
	/**
	 * Hide Home Assistant's dashboard toolbar and keep its sidebar always hidden: the card's own
	 * header replaces them, with a `SidebarButton` to open the sidebar (the Home dashboard, which
	 * phones show without kiosk mode).
	 */
	hideChrome?: boolean;
	/**
	 * A wall panel (a shared tablet): components leave out personal-device features
	 * (`useWallPanel()`), controls are touch-sized, and it's named where the shared user can't say
	 * which panel it was (`useWallPanelName()`: who armed or disarmed the alarm), by the card's
	 * `name` option, else this name (`true`: "Wall panel").
	 */
	wallPanel?: string | boolean;
}

// Without an accent sensor found, look again this often (the person's trackers may arrive later)
const ACCENT_RETRY_MS = 30_000;

/** The accent variables set on Home Assistant's page, shared by every card (kept after a card leaves) */
let chromeVars: Record<string, string> = {};

const panelStyles = (key: string) => globalThis.__panelStyles?.[key] ?? '';

/**
 * Register a Lovelace custom element that renders `component` into a ShadowRoot with the
 * panel's compiled Tailwind CSS, the bundled Poppins font, a dark-mode mount point, the
 * dialog portal container, and live Home Assistant state.
 */
export function definePanelElement({
	tag,
	component: Component,
	stylesKey,
	cardSize = 8,
	aliases = [],
	colorScheme = 'auto',
	fillViewport = false,
	hideChrome = false,
	wallPanel = false,
}: PanelElementOptions) {
	class PanelElement extends HTMLElement {
		private _root: PreactRoot | null = null;
		private _mountPoint: HTMLDivElement | null = null;
		private _styleEl: HTMLStyleElement | null = null;
		/** hass goes to the store, not a re-render: only components showing what changed update */
		private _store = createHassStore();
		/** Color scheme of the last render; the tree re-renders only when it (or the config) changes */
		private _renderedScheme: string | null = null;
		private _stopFitting: (() => void) | null = null;
		private _showToolbar: (() => void) | null = null;
		/** The signed-in person's phone accent sensor, looked up again when the registry or user changes */
		private _accentLookup: {
			entities: unknown;
			user: string | undefined;
			sensor: string | undefined;
			at: number;
		} | null = null;
		private _accentKey = '';
		private _accentVars: { panel: Record<string, string>; chrome: Record<string, string> } = { panel: {}, chrome: {} };
		private _panelVars: Record<string, string> = {};
		/** The connection the household was last asked over (asked again after a reconnect). */
		private _householdFor: unknown = null;
		public config: Record<string, unknown> = {};

		setConfig(config: Record<string, unknown>) {
			this.config = config || {};
			// The house's settings, the same for every card on the page (`house: !include ../house.yaml`)
			setHouseConfig(this.config.house);
			this._renderedScheme = null;
			this._render();
		}

		set hass(hass: HomeAssistant) {
			this._store.set(hass);
			this._loadHousehold(hass);
			if (hideChrome && this.isConnected) keepSidebarHidden(this, hass);
			this._render();
		}

		connectedCallback() {
			ensurePanelFonts();
			if (!this.shadowRoot) {
				const shadow = this.attachShadow({ mode: 'open' });

				this._styleEl = document.createElement('style');
				this._styleEl.id = `${tag}-styles`;
				shadow.appendChild(this._styleEl);

				this._mountPoint = document.createElement('div');
				this._mountPoint.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column';
				// Wall panels: every control a size up for fingers (the `touch:` variant in theme.css)
				if (wallPanel) this._mountPoint.dataset.touch = '';
				shadow.appendChild(this._mountPoint);

				// A tap on the phone's motor for every press (lives as long as the shadow root)
				installTapHaptics(shadow);
			}
			// Unmounted on disconnect; recreate when the card is re-attached
			if (!this._root && this._mountPoint) this._root = createRoot(this._mountPoint);
			this._render();
			// Before measuring the space above the element, which the toolbar took
			if (hideChrome && !this._showToolbar) this._showToolbar = hideToolbar(this);
			// Lovelace hands the card its first hass before attaching it; on a quiet house the next one can
			// be minutes away, so the sidebar is asked for here too
			const hass = this._store.get();
			if (hideChrome && hass) keepSidebarHidden(this, hass);
			if (!this._stopFitting) this._stopFitting = this._fitViewport();
		}

		disconnectedCallback() {
			this._root?.unmount();
			this._root = null;
			this._renderedScheme = null;
			this._stopFitting?.();
			this._stopFitting = null;
			this._showToolbar?.();
			this._showToolbar = null;
		}

		/**
		 * Measure Home Assistant's toolbar (the space above the element) into `--panel-top`, where
		 * dialogs start, and with `fillViewport` size the element to the screen below it; now and
		 * whenever the window or view resizes.
		 */
		private _fitViewport() {
			let frame = 0;
			const media = typeof fillViewport === 'string' ? window.matchMedia(fillViewport) : null;
			const measure = () => {
				// The toolbar is fixed, so the element's page offset is its height (also while scrolled)
				const top = Math.max(0, Math.round(this.getBoundingClientRect().top + window.scrollY));
				const fits = fillViewport !== false && (!media || media.matches);
				const height = fits ? `${Math.max(0, window.innerHeight - top)}px` : '';
				// Write only on a change, so the checks below cost a layout read and nothing more
				if (this.style.getPropertyValue('--panel-top') !== `${top}px`)
					this.style.setProperty('--panel-top', `${top}px`);
				if (this.style.height !== height) this.style.height = height;
			};
			const fit = () => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(measure);
			};
			fit();
			window.addEventListener('resize', fit);
			media?.addEventListener('change', fit);
			// Home Assistant's toolbar and the view settle after the card first attaches
			const observer = new ResizeObserver(fit);
			if (this.parentElement) observer.observe(this.parentElement);
			// A kiosk (a wall panel's app) can hide the toolbar after load: the element moves up with no
			// resize to see, and would keep the old height, a strip of nothing at the bottom. Check its
			// place every second, and as the page comes back into view.
			const watch = window.setInterval(fit, 1000);
			document.addEventListener('visibilitychange', fit);
			return () => {
				cancelAnimationFrame(frame);
				window.clearInterval(watch);
				document.removeEventListener('visibilitychange', fit);
				window.removeEventListener('resize', fit);
				media?.removeEventListener('change', fit);
				observer.disconnect();
				this.style.height = '';
				this.style.removeProperty('--panel-top');
			};
		}

		private _render() {
			if (!this._root || !this._mountPoint) return;
			// Styles load with the bundle; re-check in case the element upgraded first
			if (this._styleEl && !this._styleEl.textContent) this._styleEl.textContent = panelStyles(stylesKey);

			// Theme tokens and the dark: variant key off this class (re-resolved as the HA mode changes,
			// which the Home dashboard's Appearance picker sets)
			const setting = this.config.color_scheme ?? colorScheme;
			if (setting === 'auto') migrateDeviceColorScheme();
			const scheme = resolveColorScheme(setting, this._store.get());
			if (this._mountPoint.className !== scheme) this._mountPoint.className = scheme;
			this._applyAccent(scheme);
			if (scheme === this._renderedScheme) return;
			this._renderedScheme = scheme;

			this._root.render(
				<React.StrictMode>
					<ColorSchemeContext.Provider value={scheme}>
						<WallPanelContext.Provider value={this._wallPanelName()}>
							<DialogPortalContainer.Provider value={this._mountPoint}>
								<HassProvider store={this._store}>
									{/* A crash anywhere still leaves a message and Retry (and retries on its own), never a blank panel */}
									<ErrorBoundary name="The dashboard" variant="page">
										<Component config={this.config} />
									</ErrorBoundary>
									<ConnectionBanner />
									<BundleUpdates />
									<AssistOverlay />
									{/* Asks before music cuts off a soundbar playing its TV's sound (any control can ask) */}
									<TvAudioConfirm />
								</HassProvider>
							</DialogPortalContainer.Provider>
						</WallPanelContext.Provider>
					</ColorSchemeContext.Provider>
				</React.StrictMode>,
			);
		}

		/**
		 * The signed-in person's phone accent color (Material You, from the Companion app's Dynamic
		 * Color sensor) over the theme's neutral accent: on this card (dialogs portal into it) and on
		 * Home Assistant's own page (its buttons, switches, sliders and sidebar, which keep it after
		 * leaving the dashboard). Without one, the theme's own colors. Runs on every hass update, so
		 * it's cheap: the registry scan reruns only when the registry changes, the colors only when
		 * the sensor or the mode does.
		 */
		private _applyAccent(scheme: string) {
			const hass = this._store.get();
			if (!hass || !this._mountPoint) return;
			const user = hass.user?.id;
			// Found again when the registry or user changes, and while none is found, every so often: the
			// person's trackers can arrive after the first update
			const lookup = this._accentLookup;
			if (
				!lookup ||
				lookup.entities !== hass.entities ||
				lookup.user !== user ||
				(!lookup.sensor && Date.now() - lookup.at > ACCENT_RETRY_MS)
			)
				this._accentLookup = {
					entities: hass.entities,
					user,
					at: Date.now(),
					sensor: accentSensorFor(hass.states, hass.entities, user),
				};
			const sensor = this._accentLookup?.sensor;
			const value = sensor ? hass.states[sensor]?.state : undefined;
			const chromeDark = hass.themes?.darkMode ?? scheme === 'dark';
			const key = `${value}|${scheme}|${chromeDark}`;
			if (key !== this._accentKey) {
				this._accentKey = key;
				const rgb = parseHex(value);
				const seed = rgb && rgbToOklch(rgb);
				this._accentVars = seed
					? { panel: accentPanelTokens(seed, scheme === 'dark'), chrome: accentChromeVars(seed, chromeDark) }
					: { panel: {}, chrome: {} };
			}
			this._panelVars = applyVars(this._mountPoint, this._accentVars.panel, this._panelVars);
			chromeVars = applyVars(document.documentElement, this._accentVars.chrome, chromeVars);
		}

		/**
		 * Once per connection, ask the raineworks_dashboards integration (when it's loaded) who the
		 * household is; when that changes it, every selector looks again (a new `config` object makes
		 * the store treat the update as touching everything).
		 */
		private _loadHousehold(hass: HomeAssistant) {
			if (!hass.connection || hass.connection === this._householdFor) return;
			this._householdFor = hass.connection;
			loadHousehold(hass).then((changed) => {
				const latest = this._store.get();
				if (changed && latest) this._store.set({ ...latest, config: { ...latest.config } });
			});
		}

		/** The wall panel's name: the card's `name`, else the element's own; false when it isn't one. */
		private _wallPanelName(): string | false {
			if (!wallPanel) return false;
			const name = typeof this.config.name === 'string' ? this.config.name.trim() : '';
			return name || (typeof wallPanel === 'string' ? wallPanel : 'Wall panel');
		}

		getCardSize() {
			return cardSize;
		}
	}

	// A constructor can only be defined once, so every extra name gets its own subclass
	for (const name of [tag, ...aliases]) {
		if (!customElements.get(name)) customElements.define(name, class extends PanelElement {});
	}
	return PanelElement;
}
