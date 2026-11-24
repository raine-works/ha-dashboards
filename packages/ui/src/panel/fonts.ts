/**
 * Geist (Latin, variable weight), raineworks.com's typeface, bundled into each panel as a data URL
 * (@app/dashboard-build loads .woff2 with the dataurl loader). Without it, devices fall back to
 * their own system font, whose vertical metrics differ (e.g. icons sitting lower than text on the
 * ROAMiQ wall panel).
 *
 * @module
 */
import geist from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2';

const FONT_STYLE_ID = 'panel-ui-fonts';

/**
 * Register the panel font on the document. Chrome ignores @font-face inside a ShadowRoot,
 * but ShadowRoot text can use faces registered on the document, so this runs once per page.
 */
export function ensurePanelFonts() {
	if (typeof document === 'undefined' || document.getElementById(FONT_STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = FONT_STYLE_ID;
	style.textContent = `@font-face{font-family:'Geist';font-style:normal;font-weight:100 900;font-display:swap;src:url(${geist}) format('woff2-variations'),url(${geist}) format('woff2')}`;
	document.head.appendChild(style);
}
