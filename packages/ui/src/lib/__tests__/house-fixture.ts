import { setHouseConfig } from '../house-config';

/** A made-up house's settings (the card's `house` option, as YAML gives it), for the lib tests. */
export const FIXTURE_HOUSE = {
	announce_speaker: 'media_player.kitchen',
	tts: { engine: 'tts.house_voice', voice: 'nova', streaming: true, fallback: 'tts.backup_voice' },
	live_inputs: [
		{ name: 'Turntable', uri: 'sendspin_source://audio_source/abc123', signal: 'binary_sensor.turntable_signal' },
	],
};

/** Use the made-up house's settings. */
export const useFixtureHouse = () => setHouseConfig(FIXTURE_HOUSE);
