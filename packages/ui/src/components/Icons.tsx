import type React from 'preact/compat';

interface IconProps {
	size?: number;
	className?: string;
	style?: React.CSSProperties;
}

/** Lucide has no curtain icon: a rod and two drawn-back drapes. */
export const IconCurtains: React.FC<IconProps> = ({ size = 20, className = '', style }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
		style={style}
	>
		<path d="M3 4h18" />
		<path d="M5 4v16h3c0-5 1-10 3-16" />
		<path d="M19 4v16h-3c0-5-1-10-3-16" />
	</svg>
);

/** X's logo (Lucide carries no brand marks), for the daily brief's Trending card (what's trending on X). */
export const IconX: React.FC<IconProps> = ({ size = 20, className = '', style }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
		className={className}
		style={style}
	>
		<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
	</svg>
);

/**
 * The Xbox logo (Simple Icons 9.0.0, CC0; later releases dropped it), for a TV input named Xbox
 * (`consoleBrand()` in `lib/tv.ts`).
 */
export const IconXbox: React.FC<IconProps> = ({ size = 20, className = '', style }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
		className={className}
		style={style}
	>
		<path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z" />
	</svg>
);

/** The Nintendo Switch logo (Simple Icons, CC0), for a TV input named Nintendo or Switch. */
export const IconNintendoSwitch: React.FC<IconProps> = ({ size = 20, className = '', style }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
		className={className}
		style={style}
	>
		<path d="M14.176 24h3.674c3.376 0 6.15-2.774 6.15-6.15V6.15C24 2.775 21.226 0 17.85 0H14.1c-.074 0-.15.074-.15.15v23.7c-.001.076.075.15.226.15zm4.574-13.199c1.351 0 2.399 1.125 2.399 2.398 0 1.352-1.125 2.4-2.399 2.4-1.35 0-2.4-1.049-2.4-2.4-.075-1.349 1.05-2.398 2.4-2.398zM11.4 0H6.15C2.775 0 0 2.775 0 6.15v11.7C0 21.226 2.775 24 6.15 24h5.25c.074 0 .15-.074.15-.149V.15c.001-.076-.075-.15-.15-.15zM9.676 22.051H6.15c-2.326 0-4.201-1.875-4.201-4.201V6.15c0-2.326 1.875-4.201 4.201-4.201H9.6l.076 20.102zM3.75 7.199c0 1.275.975 2.25 2.25 2.25s2.25-.975 2.25-2.25c0-1.273-.975-2.25-2.25-2.25s-2.25.977-2.25 2.25z" />
	</svg>
);
