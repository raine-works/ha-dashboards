/**
 * The custom element every card is: a ShadowRoot with the compiled CSS and the active theme, a
 * mount point carrying the color scheme, and the providers (hass store, dialog portal, wall panel)
 * the sections and dialogs read.
 *
 * @module
 */
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
import { createHassStore } from '../lib/hass-store';
import { setHouseConfig } from '../lib/house-config';
import { loadHousehold } from '../lib/household';
import { installTapHaptics } from '../lib/tones';
import { activeTheme, loadThemeCatalog, subscribeThemeCatalog } from '../themes/catalog';
import { themeCss, themeEffects } from '../themes/css';
import type { DashboardTheme } from '../themes/tokens';
import type { HomeAssistant } from '../types/homeassistant';
import { hideToolbar, keepSidebarHidden } from './chrome';
import { ensurePanelFonts } from './fonts';

type PreactRoot = ReturnType<typeof createRoot>;

/** What a card's component is rendered with. */
export interface PanelComponentProps {
	/** The card's Lovelace YAML config, as `setConfig` received it (`{}` when there's none). */
	config: Record<string, unknown>;
}

/** How {@link definePanelElement} builds a card: its tag, component, styles and behaviour. */
export interface PanelElementOptions {
	/** Custom element tag. Lovelace strips the `custom:` prefix of `type: custom:<tag>` itself. */
	tag: string;
	/** The card's content, rendered inside the providers and an ErrorBoundary. */
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

const panelStyles = (key: string) => globalThis.__panelStyles?.[key] ?? '';

/**
 * Register a Lovelace custom element that renders `component` into a ShadowRoot with the
 * panel's compiled Tailwind CSS, the bundled Poppins font, a dark-mode mount point, the
 * dialog portal container, and live Home Assistant state. The tag and each alias are defined
 * only when not already (a second bundle on the page keeps the first's). Returns the element's
 * class.
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
		/** The active theme's tokens (themes/css.ts), after the compiled styles */
		private _themeEl: HTMLStyleElement | null = null;
		private _themeId = '';
		private _stopCatalog: (() => void) | null = null;
		/** hass goes to the store, not a re-render: only components showing what changed update */
		private _store = createHassStore();
		/** Color scheme of the last render; the tree re-renders only when it (or the config) changes */
		private _renderedScheme: string | null = null;
		private _stopFitting: (() => void) | null = null;
		private _showToolbar: (() => void) | null = null;
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
			void loadThemeCatalog(hass);
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
				this._themeEl = document.createElement('style');
				this._themeEl.id = `${tag}-theme`;
				shadow.appendChild(this._themeEl);

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
			// A custom theme saved, or the house theme changed: draw with it
			this._stopCatalog ??= subscribeThemeCatalog(() => {
				this._themeId = '';
				this._render();
			});
			// Lovelace hands the card its first hass before attaching it; on a quiet house the next one can
			// be minutes away, so the sidebar is asked for here too
			const hass = this._store.get();
			if (hideChrome && hass) keepSidebarHidden(this, hass);
			if (!this._stopFitting) this._stopFitting = this._fitViewport();
		}

		disconnectedCallback() {
			this._stopCatalog?.();
			this._stopCatalog = null;
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
			this._applyTheme(activeTheme(this._store.get(), this.config.theme));
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

		/** The theme's tokens and effects on this card, rewritten only when the theme changes. */
		private _applyTheme(theme: DashboardTheme) {
			if (!this._themeEl || !this._mountPoint || theme.id === this._themeId) return;
			this._themeId = theme.id;
			this._themeEl.textContent = themeCss(theme);
			const effects = themeEffects(theme);
			if (effects) this._mountPoint.dataset.effects = effects;
			else delete this._mountPoint.dataset.effects;
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
