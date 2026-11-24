/**
 * Poppins (Latin) bundled into each panel as data URLs (@app/dashboard-build loads .woff2 with the
 * dataurl loader). Without it, devices fall back to their own system font, whose vertical
 * metrics differ (e.g. icons sitting lower than text on the ROAMiQ wall panel).
 *
 * @module
 */
import poppins300 from '@fontsource/poppins/files/poppins-latin-300-normal.woff2';
import poppins400 from '@fontsource/poppins/files/poppins-latin-400-normal.woff2';
import poppins500 from '@fontsource/poppins/files/poppins-latin-500-normal.woff2';
import poppins600 from '@fontsource/poppins/files/poppins-latin-600-normal.woff2';

const FONT_STYLE_ID = 'panel-ui-fonts';

const FACES: [weight: number, src: string][] = [
	[300, poppins300],
	[400, poppins400],
	[500, poppins500],
	[600, poppins600],
];

/**
 * Register the panel font on the document. Chrome ignores @font-face inside a ShadowRoot,
 * but ShadowRoot text can use faces registered on the document, so this runs once per page.
 */
export function ensurePanelFonts() {
	if (typeof document === 'undefined' || document.getElementById(FONT_STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = FONT_STYLE_ID;
	style.textContent = FACES.map(
		([weight, src]) =>
			`@font-face{font-family:'Poppins';font-style:normal;font-weight:${weight};font-display:swap;src:url(${src}) format('woff2')}`,
	).join('');
	document.head.appendChild(style);
}
