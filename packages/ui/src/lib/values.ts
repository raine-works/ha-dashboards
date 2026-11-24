/**
 * Attribute coercers: Home Assistant's attributes (and script responses) are untyped JSON.
 *
 * @module
 */

/** A finite number, else undefined (null, NaN, a numeric string). */
export const finiteNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** A string with something in it, trimmed; else undefined. */
export const trimmedString = (value: unknown) =>
	typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** A state Home Assistant can't read: `unavailable` or `unknown`. */
export const isUnavailable = (state: string | undefined) => state === 'unavailable' || state === 'unknown';
