// The house's voice: one text-to-speech engine and voice everywhere (the house settings' `tts`,
// lib/house-config.ts), the voice named on every call so a change of the engine's default never
// changes it. Without settings, the first `tts.*` Home Assistant has, in its own default voice.

import type { HassEntity } from '../types/homeassistant';
import { houseConfig } from './house-config';

type States = Record<string, HassEntity | undefined>;

/** The house's text-to-speech entity: the settings' engine, else the first `tts.*` in `states`. */
export function houseTtsEngine(states?: States): string | undefined {
	return houseConfig().tts.engine ?? Object.keys(states ?? {}).find((id) => id.startsWith('tts.'));
}

/** TTS options for every call in the house's voice (`tts.speak`'s `options`, Chime TTS's `options`). */
export function houseTtsOptions(): Record<string, string> | undefined {
	const { voice } = houseConfig().tts;
	return voice ? { voice } : undefined;
}

/**
 * The engine speaks an answer as it's written (Home Assistant's streaming text-to-speech): the
 * Assist pipeline speaks through it itself, one unbroken stream, rather than the page asking for
 * the answer's speech piece by piece.
 */
export function isStreamingTts(engine: string | undefined): boolean {
	const { tts } = houseConfig();
	return !!engine && tts.streaming && engine === tts.engine;
}

/**
 * `tts.speak` in the house's voice, and with the settings' fallback engine when that fails (an
 * outage, a limit reached), so a message to the door is always spoken. `call` makes the
 * `tts.speak` call and must reject on failure; rejects only when every engine fails (or there's none).
 */
export async function speakWithFallback(
	call: (data: Record<string, unknown>) => Promise<unknown>,
	mediaPlayer: string,
	message: string,
	states?: States,
): Promise<'house' | 'fallback'> {
	const engine = houseTtsEngine(states);
	const { fallback } = houseConfig().tts;
	if (!engine) throw new Error('No text-to-speech engine in Home Assistant');
	const options = houseTtsOptions();
	try {
		await call({ entity_id: engine, media_player_entity_id: mediaPlayer, message, ...(options && { options }) });
		return 'house';
	} catch (err) {
		if (!fallback || fallback === engine) throw err;
		console.warn("The house's voice failed, speaking with the fallback voice:", err);
		await call({ entity_id: fallback, media_player_entity_id: mediaPlayer, message });
		return 'fallback';
	}
}
