/**
 * Push settings: which kinds of push (the doorbell, laundry, the daily brief…) the signed-in
 * household member gets on their phone, kept by the raineworks_dashboards integration
 * (`raineworks_dashboards/push/preferences` and `/push/set`). Security always comes through.
 *
 * @module
 */

/** A kind of push, as the integration describes it, and whether this member gets it. */
export interface PushCategory {
	id: string;
	name: string;
	description: string;
	/** It always comes through (Security): shown on, never a switch. */
	always: boolean;
	enabled: boolean;
}

/** The signed-in member's push settings: their person (null for anyone who isn't a member) and the categories. */
export interface PushPreferences {
	person: string | null;
	categories: PushCategory[];
}

/** The websocket commands. */
export const PUSH_PREFERENCES = 'raineworks_dashboards/push/preferences';
export const PUSH_SET = 'raineworks_dashboards/push/set';

/**
 * The settings with one category turned on or off, shown at once while the integration saves it. A
 * category that always comes through, or one that isn't listed, is left as it is.
 */
export function withChoice(preferences: PushPreferences, id: string, enabled: boolean): PushPreferences {
	return {
		...preferences,
		categories: preferences.categories.map((category) =>
			category.id === id && !category.always ? { ...category, enabled } : category,
		),
	};
}

/** How many categories are on, for the button's line ("7 of 9 on"). */
export const enabledCount = (preferences: PushPreferences) =>
	preferences.categories.filter((category) => category.enabled).length;
