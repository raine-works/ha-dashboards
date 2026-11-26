/**
 * The custom element every card is: a ShadowRoot with the compiled CSS and the active theme, a
 * mount point carrying the color scheme, and the providers (hass store, dialog portal, wall panel)
 * the sections and dialogs read.
 *
 * @module
 */
import React from 'preact/compat';
import { createRoot } from 'preact/compat/client';
import { PanelAlerts } from '../components/alerts/PanelAlerts';
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
import { homeBedtimeEntity } from '../lib/bedtime';
import { createHassStore } from '../lib/hass-store';
import { setHouseConfig } from '../lib/house-config';
import { loadHousehold } from '../lib/household';
import { installTapHaptics } from '../lib/tones';
import { activeTheme, loadThemeCatalog, subscribeThemeCatalog } from '../themes/catalog';
import { themeCss, themeEffects } from '../themes/css';
import { isNight, nightCss } from '../themes/night';
import type { DashboardTheme } from '../themes/tokens';
import type { HomeAssistant } from '../types/homeassistant';
import { hidePageScrollbar, hideToolbar, keepSidebarHidden, toolbarBottom } from './chrome';
import { ensurePanelFonts } from './fonts';
import { isPageHost, joinPage, type PageCard } from './page-host';

type PreactRoot = ReturnType<typeof createRoot>;

/** What a card's component is rendered with. */
export interface PanelComponentProps {
	/** The card's Lovelace YAML config, as `setConfig` received it (`{}` when there's none). */
	config: Record<string, unknown>;
}

/** A card's size in Home Assistant's sections view (its `getGridOptions()`; 12 columns a section). */
export interface CardGridOptions {
	columns?: number | 'full';
	rows?: number | 'auto';
	min_columns?: number;
	min_rows?: number;
}

/**
 * A section card: one part of a dashboard, placed by Home Assistant's own layout (its sections view,
 * or any other) among any other cards, instead of a whole page.
 */
export interface SectionCardOptions {
	/** Its name in Home Assistant's card picker ("Raineworks Lighting"). */
	name: string;
	/** What it shows, under the name in the card picker. */
	description: string;
	/** Its size in the sections view. */
	grid?: CardGridOptions;
	/** A new card's YAML when it's picked (`getStubConfig()`), beside its `type`. */
	stub?: Record<string, unknown>;
}

/** Home Assistant's card picker list (`window.customCards`). */
interface CustomCardEntry {
	type: string;
	name: string;
	description: string;
	preview?: boolean;
	documentationURL?: string;
}

declare global {
	interface Window {
		customCards?: CustomCardEntry[];
	}
}

/** Where a card's options are documented, for the card picker's link. */
const CARDS_DOCS = 'https://github.com/raine-works/ha-dashboards/blob/master/docs/cards.md';

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
	/**
	 * A section card, not a whole page: it's as tall as its content in the flow of Home Assistant's
	 * page (nothing fitted, the toolbar and sidebar left alone), transparent on the view's background,
	 * its breakpoints follow its own width (`[data-card]`, theme.css), it's listed in Home Assistant's
	 * card picker, and the page's alerts and overlays come from whichever card hosts them (page-host.ts).
	 */
	card?: SectionCardOptions;
}

const panelStyles = (key: string) => globalThis.__panelStyles?.[key] ?? '';

/**
 * Register a Lovelace custom element that renders `component` into a ShadowRoot with the
 * panel's compiled Tailwind CSS, the bundled Geist font, a dark-mode mount point, the
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
	card,
}: PanelElementOptions) {
	class PanelElement extends HTMLElement {
		private _root: PreactRoot | null = null;
		private _mountPoint: HTMLDivElement | null = null;
		private _styleEl: HTMLStyleElement | null = null;
		/** The active theme's tokens (themes/css.ts), after the compiled styles */
		private _themeEl: HTMLStyleElement | null = null;
		private _themeId = '';
		// The theme's effects (edges, glow), the glow left out at night
		private _effects = '';
		private _stopCatalog: (() => void) | null = null;
		/** hass goes to the store, not a re-render: only components showing what changed update */
		private _store = createHassStore();
		/** Color scheme of the last render; the tree re-renders only when it (or the config) changes */
		private _renderedScheme: string | null = null;
		private _stopFitting: (() => void) | null = null;
		private _showToolbar: (() => void) | null = null;
		// Shows the page's scrollbar again (hidePageScrollbar())
		private _showPageScrollbar: (() => void) | null = null;
		/** The connection the household was last asked over (asked again after a reconnect). */
		private _householdFor: unknown = null;
		/** This card on the page: whether it mounts the page's overlays (page-host.ts). */
		private _page: PageCard = {
			priority: card ? 0 : 1,
			onHostChange: () => {
				this._renderedScheme = null;
				this._render();
			},
		};
		private _leavePage: (() => void) | null = null;

		/** A new card's YAML, beside its `type`, when Home Assistant's card picker adds one. */
		static getStubConfig() {
			return { ...card?.stub };
		}
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

				// A section card: content height, on the view's background (theme.css's :host([data-card-mode]))
				if (card) this.dataset.cardMode = '';
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
			// No scrollbar on the page while the dashboard is on it (a section card leaves the page as it is)
			if (!card) this._showPageScrollbar ??= hidePageScrollbar();
			this._leavePage ??= joinPage(this._page);
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
			this._showPageScrollbar?.();
			this._showPageScrollbar = null;
			this._leavePage?.();
			this._leavePage = null;
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
				// The toolbar is fixed, so a page's offset is its height (also while scrolled); a section card
				// sits further down the page, so it asks the toolbar
				const top = card
					? toolbarBottom(this)
					: Math.max(0, Math.round(this.getBoundingClientRect().top + window.scrollY));
				const fits = !card && fillViewport !== false && (!media || media.matches);
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
			this._applyNight();
			if (scheme === this._renderedScheme) return;
			this._renderedScheme = scheme;
			// What the page needs once (the banner, the update toast, the Assist glow, the TV-audio confirm;
			// a section card's alerts too), from one card however many are on it
			const host = isPageHost(this._page);

			this._root.render(
				<React.StrictMode>
					<ColorSchemeContext.Provider value={scheme}>
						<WallPanelContext.Provider value={this._wallPanelName()}>
							<DialogPortalContainer.Provider value={this._mountPoint}>
								<HassProvider store={this._store}>
									{/* A crash anywhere still leaves a message and Retry (and retries on its own), never a blank panel */}
									<ErrorBoundary name={card ? card.name : 'The dashboard'} variant={card ? 'inline' : 'page'}>
										{card ? (
											// The breakpoints inside follow this width (theme.css); dialogs portal outside it
											<div data-card className="@container/card w-full">
												<Component config={this.config} />
											</div>
										) : (
											<Component config={this.config} />
										)}
									</ErrorBoundary>
									{host && (
										<>
											<ConnectionBanner />
											<BundleUpdates />
											<AssistOverlay />
											{/* Asks before music cuts off a soundbar playing its TV's sound (any control can ask) */}
											<TvAudioConfirm />
											{/* A page's own layout mounts its alerts; section cards share one host's */}
											{card && <PanelAlerts />}
										</>
									)}
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
			this._themeEl.textContent = `${themeCss(theme)}\n${nightCss()}`;
			this._effects = themeEffects(theme);
			this._applyNight(true);
		}

		/**
		 * The night level on a wall panel while Home Bedtime is on (themes/night.ts): `data-night` on the
		 * mount point dims the tokens, and the theme's glow goes. Checked on every update (one state read).
		 */
		private _applyNight(force = false) {
			if (!this._mountPoint) return;
			const states = this._store.get()?.states;
			const night = isNight(!!wallPanel, states?.[homeBedtimeEntity(states)]?.state);
			if (!force && night === 'night' in this._mountPoint.dataset) return;
			if (night) this._mountPoint.dataset.night = '';
			else delete this._mountPoint.dataset.night;
			const effects = night ? this._effects.replace(/\bglow\b/, '').trim() : this._effects;
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

		/** Its size in Home Assistant's sections view. */
		getGridOptions() {
			return card?.grid ?? { columns: 'full', rows: 'auto' };
		}
	}

	// A section card appears in Home Assistant's card picker (once, however often the bundle loads)
	if (card && typeof window !== 'undefined') {
		window.customCards ??= [];
		if (!window.customCards.some((c) => c.type === tag))
			window.customCards.push({
				type: tag,
				name: card.name,
				description: card.description,
				preview: true,
				documentationURL: CARDS_DOCS,
			});
	}

	// A constructor can only be defined once, so every extra name gets its own subclass
	for (const name of [tag, ...aliases]) {
		if (!customElements.get(name)) customElements.define(name, class extends PanelElement {});
	}
	return PanelElement;
}
