/**
 * Daily affirmations: where each person's is stored, and reading it back.
 *
 * @module
 */
import type { HassEntity } from '../types/homeassistant';
import { isSameDay } from './calendar';

/**
 * Each household member's latest daily affirmation (the greeting `automation.known_face_message`
 * speaks when a camera first recognizes them each day): the raineworks_dashboards integration's
 * `sensor.daily_affirmation_<person's object id>` (its state when it was written, its `text`
 * attribute the words; `raineworks_dashboards.set_affirmation` writes it), else a house's own UI
 * `input_text` of that name, as JSON `{"at": <epoch s>, "text": "..."}` (255 characters at most).
 */
// house-audit: discovery (the integration's affirmation sensors)
export const affirmationEntity = (personId: string) => `sensor.daily_affirmation_${personId.replace(/^person\./, '')}`;

/** A house's own helper, before the integration's sensor. */
export const formerAffirmationEntity = (personId: string) =>
	`input_text.daily_affirmation_${personId.replace(/^person\./, '')}`;

/** A stored affirmation. */
export interface DailyAffirmation {
	/** When it was written (spoken). */
	at: Date;
	/** Its words, trimmed. */
	text: string;
}

/** The affirmation in its sensor (or helper); undefined until one has been stored. */
export function toAffirmation(entity?: HassEntity): DailyAffirmation | undefined {
	if (!entity) return undefined;
	if (entity.entity_id?.startsWith('sensor.')) {
		const at = new Date(entity.state);
		const text = typeof entity.attributes.text === 'string' ? entity.attributes.text.trim() : '';
		return Number.isNaN(at.getTime()) || !text ? undefined : { at, text };
	}
	let value: unknown;
	try {
		value = JSON.parse(entity.state);
	} catch {
		return undefined;
	}
	if (!value || typeof value !== 'object') return undefined;
	const { at, text } = value as Record<string, unknown>;
	if (typeof at !== 'number' || !Number.isFinite(at) || typeof text !== 'string' || !text.trim()) return undefined;
	return { at: new Date(at * 1000), text: text.trim() };
}

/** Spoken today. */
export const isAffirmationCurrent = (affirmation: DailyAffirmation, now = new Date()) => isSameDay(affirmation.at, now);
