/**
 * The section cards' options, from their YAML: anything missing or of the wrong shape is left out
 * (its default used), never an error, as the house settings are.
 *
 * @module
 */

/** The Lighting card's options. */
export interface LightingCardOptions {
	/** Its heading ("Lighting"). */
	title: string;
	/** A floor id: its lights first, then the nearest floors'. Without one, every floor, top first. */
	floor?: string;
}

/** The Security card's options. */
export interface SecurityCardOptions {
	/** The cameras at its foot (default); off beside a Cameras card. */
	cameras: boolean;
}

type Config = Record<string, unknown> | undefined;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** The Lighting card's options (`title`, `floor`). */
export const lightingCardOptions = (config: Config): LightingCardOptions => ({
	title: text(config?.title) ?? 'Lighting',
	floor: text(config?.floor),
});

/** The Security card's options (`cameras`). */
export const securityCardOptions = (config: Config): SecurityCardOptions => ({
	cameras: config?.cameras !== false,
});
