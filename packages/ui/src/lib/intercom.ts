/**
 * The intercom: which speakers can take an announcement, how a voice clip or a text message gets
 * to them (and to TVs), and the quick messages for speakers and phones.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { INTEGRATION } from './household';
import { isSpeaker, isTvAudio } from './music';
import { callForResponse } from './service-calls';
import { houseTtsEngine, houseTtsOptions, speakWithFallback } from './tts';
import { isUnavailable } from './values';
import { encodeWav } from './wav';

/** A Music Assistant speaker the intercom can announce on. */
export interface IntercomSpeaker {
	/** The speaker's `media_player` entity id. */
	entityId: string;
	/** Its friendly name, else its object id with spaces. */
	name: string;
	/** False while Home Assistant reports it unavailable or unknown. */
	available: boolean;
	/** Whether it's playing something now. */
	isPlaying: boolean;
	/** Playing its TV's sound (a soundbar on its TV input): left out of announcements. */
	tvAudio: boolean;
}

/** Where an announcement goes and how it sounds. */
export interface BroadcastOptions {
	/** The speakers' `media_player` entity ids (a group's members collapse to its leader). */
	speakers: string[];
	/**
	 * TVs to say it on too (Raineworks TV's `media_player`s): spoken over whatever's on, the show
	 * ducking. The volume and chime are the speakers' (a TV keeps its own volume).
	 */
	tvs?: string[];
	/** Announcement volume, 0-100. */
	volume: number;
	/** Play the Music Assistant pre-announce chime first. */
	chime: boolean;
}

// Clips staged in HA local media are removed after they've had time to play
const RECORDING_CLEANUP_MS = 60000;
/** How old a clip in local media gets before `purgeStaleRecordings` sweeps it (the timed cleanup missed it). */
export const RECORDING_MAX_AGE_MS = 10 * 60 * 1000;

/** Music Assistant players (MA tags its entities with `mass_player_type`), browser players and hidden ones left out. */
export function discoverIntercomSpeakers(
	states: Record<string, HassEntity>,
	hass?: Pick<HomeAssistant, 'entities' | 'devices'> | null,
): IntercomSpeaker[] {
	return Object.values(states)
		.filter(
			(s) =>
				s.entity_id.startsWith('media_player.') &&
				(s.attributes.mass_player_type !== undefined || s.attributes.app_id === 'music_assistant') &&
				isSpeaker(s.entity_id, hass),
		)
		.map((s) => ({
			entityId: s.entity_id,
			name: s.attributes.friendly_name || s.entity_id.replace('media_player.', '').replace(/_/g, ' '),
			available: !isUnavailable(s.state),
			isPlaying: s.state === 'playing',
			tvAudio: isTvAudio(s.attributes),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

const RECORDING_NAME = /^intercom_(\d+)\.wav$/;
const LOCAL_MEDIA = 'media-source://media_source/local';

/**
 * Base for clip URLs handed to Music Assistant. Prefer HA's external URL: it is the route
 * Music Assistant (on the HA host) is known to reach; internal hostnames may resolve to a
 * proxy it can't use.
 */
const clipBaseUrl = (hass: HomeAssistant) => hass.config?.external_url || window.location.origin;

/** The integration's clip upload (any signed-in user), when it's loaded. */
export const CLIP_UPLOAD_PATH = `/api/${INTEGRATION}/clips`;

/** Whether the raineworks_dashboards integration takes the clips (it uploads, signs and deletes them). */
export const integrationTakesClips = (hass: Pick<HomeAssistant, 'config'>) =>
	!!hass.config?.components?.includes(INTEGRATION);

/**
 * Stage a clip where the speakers can fetch it: the integration's clip upload (any signed-in user;
 * it signs the URL and deletes the clip after ten minutes), else Home Assistant's local media
 * (admins only, deleted after RECORDING_CLEANUP_MS and by purgeStaleRecordings).
 */
async function stageRecording(hass: HomeAssistant, wav: Blob): Promise<string> {
	if (!hass.fetchWithAuth || !hass.callWS) throw new Error('Home Assistant connection not ready');
	if (integrationTakesClips(hass)) {
		const upload = await hass.fetchWithAuth(CLIP_UPLOAD_PATH, {
			method: 'POST',
			body: wav,
			headers: { 'Content-Type': 'audio/wav' },
		});
		if (!upload.ok) throw new Error(`Upload failed (HTTP ${upload.status})`);
		const { url } = (await upload.json()) as { url?: string };
		if (!url) throw new Error('Upload gave no URL');
		return `${clipBaseUrl(hass)}${url}`;
	}

	const filename = `intercom_${Date.now()}.wav`;
	const form = new FormData();
	form.append('media_content_id', LOCAL_MEDIA);
	form.append('file', wav, filename);

	const upload = await hass.fetchWithAuth('/api/media_source/local_source/upload', { method: 'POST', body: form });
	if (upload.status === 401) throw new Error('Voice messages require a Home Assistant admin user');
	if (!upload.ok) throw new Error(`Upload failed (HTTP ${upload.status})`);
	const { media_content_id: uploadedId } = (await upload.json()) as { media_content_id?: string };
	const mediaContentId = (uploadedId || `${LOCAL_MEDIA}/${filename}`).replace('local//', 'local/');

	const resolved = await hass.callWS<{ url?: string }>({
		type: 'media_source/resolve_media',
		media_content_id: mediaContentId,
	});
	if (!resolved?.url) throw new Error('Failed to resolve uploaded audio');

	// Best effort; purgeStaleRecordings catches anything this misses (e.g. the page closed)
	setTimeout(() => {
		hass.callWS?.({ type: 'media_source/local_source/remove', media_content_id: mediaContentId }).catch(() => {});
	}, RECORDING_CLEANUP_MS);

	return resolved.url.startsWith('http') ? resolved.url : `${clipBaseUrl(hass)}${resolved.url}`;
}

/**
 * The speakers an announcement goes to, one per Music Assistant group (its leader, first of
 * `group_members`): an announcement sent to a group's member plays on the whole group, so each
 * member picked played it again. Speakers not in a group stay as they are.
 */
export function announceTargets(states: Record<string, HassEntity | undefined>, speakers: string[]): string[] {
	const targets: string[] = [];
	for (const speaker of speakers) {
		const members = states[speaker]?.attributes.group_members;
		const leader = Array.isArray(members) && members.length > 1 ? String(members[0]) : speaker;
		if (!targets.includes(leader)) targets.push(leader);
	}
	return targets;
}

/**
 * Upload a voice clip (the integration's clip upload, else HA local media) and announce it on the
 * selected Music Assistant players and TVs.
 * @param samples Mono samples in -1…1, encoded to a WAV with a short silence at each end.
 * @throws When the connection isn't ready, the upload fails (local media needs an admin), or a
 *   service call fails.
 */
export async function broadcastRecording(
	hass: HomeAssistant,
	samples: Float32Array,
	sampleRate: number,
	{ speakers, tvs = [], volume, chime }: BroadcastOptions,
): Promise<void> {
	// 200ms head lets speaker DACs un-mute; 500ms tail avoids cutting off the last word
	const wav = new Blob([encodeWav(samples, sampleRate, 0.2, 0.5)], { type: 'audio/wav' });
	const url = await stageRecording(hass, wav);

	await Promise.all([
		speakers.length > 0 &&
			hass.callService('music_assistant', 'play_announcement', {
				entity_id: announceTargets(hass.states, speakers),
				url,
				announce_volume: volume,
				use_pre_announce: chime,
			}),
		// The TVs play it as an announcement over what's on (the URL is signed, so they can load it)
		tvs.length > 0 &&
			hass.callService('media_player', 'play_media', {
				entity_id: tvs,
				media_content_type: 'music',
				media_content_id: url,
				announce: true,
			}),
	]);
}

/**
 * Delete intercom clips (intercom_<epoch ms>.wav) older than maxAgeMs from HA local media.
 * The filename carries its upload time, so no file metadata is needed. Admin only.
 * @returns How many clips it deleted: 0 for non-admins, or when the integration takes the clips.
 */
export async function purgeStaleRecordings(
	hass: HomeAssistant,
	maxAgeMs = RECORDING_MAX_AGE_MS,
	now = Date.now(),
): Promise<number> {
	// The integration deletes its own clips; local media needs an admin
	if (!hass.callWS || !hass.user?.is_admin || integrationTakesClips(hass)) return 0;
	const listing = await hass.callWS<{ children?: { title: string; media_content_id: string }[] }>({
		type: 'media_source/browse_media',
		media_content_id: LOCAL_MEDIA,
	});
	const stale = (listing.children ?? []).filter((item) => {
		const match = RECORDING_NAME.exec(item.title);
		return match && now - Number(match[1]) > maxAgeMs;
	});
	await Promise.all(
		stale.map((item) =>
			hass.callWS?.({ type: 'media_source/local_source/remove', media_content_id: item.media_content_id }),
		),
	);
	return stale.length;
}

/**
 * Speak a text announcement. Prefers the integration's announce, then script.play_announcement (the
 * house's voice via chime_tts into Music Assistant), then chime_tts.say_url + MA directly, then plain
 * tts.speak per speaker. A person
 * asked for it (the intercom, the kitchen timer), so it plays during the script's quiet hours too.
 */
export async function broadcastText(
	hass: HomeAssistant,
	message: string,
	{ speakers, tvs = [], volume, chime }: BroadcastOptions,
): Promise<void> {
	await Promise.all([
		speakers.length > 0 && announceText(hass, message, { speakers, volume, chime }),
		// The TVs speak it over what's on in the house's voice (Raineworks TV plays text-to-speech as
		// an announcement)
		...tvs.map((tv) => speakWithFallback((data) => hass.callService('tts', 'speak', data), tv, message, hass.states)),
	]);
}

/** Text on the Music Assistant speakers, through the first way that works. */
async function announceText(
	hass: HomeAssistant,
	message: string,
	{ speakers, volume, chime }: BroadcastOptions,
): Promise<void> {
	// The integration's announce (the house's voice, a holiday's chime), a person's own: no quiet hours
	if (hass.services?.[INTEGRATION]?.announce) {
		try {
			await hass.callService(INTEGRATION, 'announce', {
				message,
				speakers,
				volume,
				chime,
				quiet_hours: false,
				// The TVs only when picked in the intercom (sent separately), never from the timer
				tvs: false,
			});
			return;
		} catch (err) {
			console.warn('[Intercom] raineworks_dashboards.announce failed:', err);
		}
	}

	if (hass.services?.script?.play_announcement) {
		try {
			await hass.callService('script', 'play_announcement', {
				message,
				target_speakers: speakers,
				volume,
				cache: false,
				use_pre_announce: chime,
				quiet_hours: false,
				// The TVs only when picked in the intercom (sent separately), never from the kitchen timer
				tvs: false,
			});
			return;
		} catch (err) {
			console.warn('[Intercom] script.play_announcement failed:', err);
		}
	}

	if (hass.services?.chime_tts?.say_url && hass.callWS) {
		try {
			const said = await callForResponse<{ url?: string }>(hass, 'chime_tts', 'say_url', {
				message,
				tts_platform: houseTtsEngine(hass.states),
				options: houseTtsOptions(),
				cache: false,
			});
			if (said?.url) {
				await hass.callService('music_assistant', 'play_announcement', {
					entity_id: announceTargets(hass.states, speakers),
					url: said.url,
					announce_volume: volume,
					use_pre_announce: chime,
				});
				return;
			}
		} catch (err) {
			console.warn('[Intercom] chime_tts.say_url fallback failed:', err);
		}
	}

	for (const speaker of speakers) {
		await speakWithFallback((data) => hass.callService('tts', 'speak', data), speaker, message, hass.states);
	}
}

/** What an announcement goes to: "Kitchen", "2 speakers", "2 speakers and Master Suite TV". */
export function intercomTargetLabel(speakers: string[], tvs: string[], name: (id: string) => string): string {
	const one = (ids: string[], noun: string) =>
		ids.length === 1 ? name(ids[0]) : ids.length > 1 ? `${ids.length} ${noun}` : undefined;
	return [one(speakers, 'speakers'), one(tvs, 'TVs')].filter(Boolean).join(' and ') || 'nothing';
}

/**
 * The longest message the intercom sends to a phone: about what the iPhone lock screen and
 * Android's collapsed notification show without cutting it off.
 */
export const PHONE_MESSAGE_MAX = 150;

/** A set of quick messages under one heading: a category chip picks which set shows. */
export interface PresetCategory<T> {
	id: string;
	label: string;
	presets: T[];
	/** The picker opens on it, whatever was picked before (a holiday's, in its days). */
	featured?: boolean;
}

/** A quick announcement: the chip's label, and what the speakers say. */
export interface AnnouncementPreset {
	label: string;
	message: string;
}

/** Quick announcements for the speakers, by category; the fun ones are meant to get a laugh. */
export const ANNOUNCEMENT_PRESETS: PresetCategory<AnnouncementPreset>[] = [
	{
		id: 'meals',
		label: 'Meals',
		presets: [
			{ label: 'Dinner is ready', message: 'Dinner is ready, please come to the kitchen!' },
			{ label: 'Breakfast is ready', message: 'Breakfast is ready, come and eat!' },
			{ label: 'Lunch is ready', message: 'Lunch is ready, please come to the kitchen.' },
			{ label: 'Come set the table', message: 'Can someone please come help set the table?' },
			{ label: 'Snack time', message: 'Snack time! Come to the kitchen.' },
			{ label: 'Dessert is served', message: 'Dessert is served! Come get it while it lasts.' },
		],
	},
	{
		id: 'family',
		label: 'Family',
		presets: [
			{ label: 'Come here please', message: 'Can someone please come here for a moment?' },
			{ label: 'Family meeting', message: 'Family meeting in the living room now, please!' },
			{ label: 'Family prayer', message: 'Time for family prayer, please come to the living room.' },
			{ label: 'Someone at the door', message: 'Someone is at the front door!' },
			{ label: 'Leaving in 5 minutes', message: 'We are leaving in five minutes, please get ready.' },
			{ label: 'Shoes on, we’re leaving', message: 'Shoes on and out to the car, we are leaving now!' },
			{ label: 'Help with groceries', message: 'Groceries are here! Please come help carry them in.' },
			{ label: 'Movie time', message: 'Movie time! Head down to the theater room.' },
		],
	},
	{
		id: 'chores',
		label: 'Chores',
		presets: [
			{ label: 'Feed the pets', message: 'Please feed Chai and Rue their food.' },
			{ label: 'Clean up time', message: 'Clean up time! Please pick up your things.' },
			{ label: 'Tidy your room', message: 'Please go tidy up your room.' },
			{ label: 'Unload the dishwasher', message: 'The dishwasher is clean, please unload it.' },
			{ label: 'Take out the garbage', message: 'Please take out the garbage.' },
			{ label: 'Laundry is done', message: 'The laundry is done, please come switch it over.' },
			{ label: 'Homework time', message: 'Homework time! Please get started on your homework.' },
		],
	},
	{
		id: 'bedtime',
		label: 'Bedtime',
		presets: [
			{ label: 'Time for bed', message: 'Time to wind down and get ready for bed.' },
			{ label: 'Lights out in 10', message: 'Lights out in ten minutes!' },
			{ label: 'Brush your teeth', message: 'Time to brush your teeth and get your pajamas on.' },
			{ label: 'Quiet please', message: 'Quiet please, someone is sleeping.' },
			{ label: 'Rise and shine', message: 'Good morning! Rise and shine, time to get up.' },
		],
	},
	{
		id: 'fun',
		label: 'Fun',
		presets: [
			{ label: 'Dance party!', message: 'Emergency dance party! Everyone to the kitchen, now!' },
			{ label: 'The floor is lava', message: 'Attention: the floor is lava. Repeat, the floor is lava!' },
			{
				label: 'Captain speaking',
				message:
					'This is your captain speaking. We are beginning our descent into dinner. Please return to the kitchen.',
			},
			{
				label: 'Royal decree',
				message: 'Hear ye, hear ye! By royal decree, all citizens shall report to the kitchen at once.',
			},
			{ label: 'Pirate call', message: 'Ahoy, mateys! Grub is up in the galley. All hands on deck!' },
			{
				label: 'Robot mode',
				message: 'Beep boop. Humans detected upstairs. Please report to the kitchen for refueling. Beep.',
			},
			{
				label: 'Earthlings',
				message: 'Attention, earthlings. The mothership requests your presence in the kitchen. Resistance is futile.',
			},
			{
				label: 'And the crowd goes wild',
				message: 'And the crowd goes wild! Dinner has entered the building!',
			},
			{
				label: 'Cookie investigation',
				message: 'This is an official investigation. Who ate the last cookie? Come forward now.',
			},
			{
				label: 'Hug break',
				message: 'Mandatory hug break. Please report to the nearest family member for a hug.',
			},
			{
				label: 'The cats complain',
				message: 'Chai and Rue have filed a formal complaint. Their food bowls are empty and they are not happy.',
			},
			{ label: 'Tickle monster', message: 'Warning: the tickle monster is on the loose. Hide while you can!' },
		],
	},
];

/** Quick messages for phones, by category, short enough to read at a glance. */
export const PHONE_PRESETS: PresetCategory<string>[] = [
	{
		id: 'everyday',
		label: 'Everyday',
		presets: [
			'Dinner is ready!',
			'Can you call me?',
			'Please come downstairs',
			'Please come home',
			'Where are you?',
			'Check your messages',
		],
	},
	{
		id: 'on-the-way',
		label: 'On the way',
		presets: [
			'On my way home',
			'Running a little late',
			'Leaving in 5 minutes',
			'Be there in 10',
			'I’m outside',
			'Can you pick me up?',
		],
	},
	{
		id: 'errands',
		label: 'Errands',
		presets: [
			'Can you grab milk on the way home?',
			'Need anything from the store?',
			'Did you lock the door?',
			'Did you close the garage?',
			'Don’t forget your homework',
		],
	},
	{
		id: 'love',
		label: 'Love',
		presets: [
			'Love you!',
			'Proud of you!',
			'Thinking of you',
			'Have a great day!',
			'Good luck today!',
			'You’ve got this!',
		],
	},
	{
		id: 'fun',
		label: 'Fun',
		presets: [
			'Ice cream run? 🍦',
			'Pizza night? 🍕',
			'Dance party when you get home 💃',
			'Bring snacks or don’t come home 😄',
			'The cats miss you 🐱',
			'Hug required upon arrival 🤗',
			'Send memes',
			'The royal court requests your presence 👑',
		],
	},
];

/**
 * A message for household phones (`script.notify_people`): titled with who sent it ("From Alex",
 * "From the Kitchen wall panel"), the text trimmed and kept to `PHONE_MESSAGE_MAX`. Each gets its
 * own tag, so a second message never replaces the first; tapping one opens the Home dashboard.
 */
export function phoneMessage(sender: string | undefined, text: string, now = Date.now()) {
	return {
		title: sender ? `From ${sender}` : 'From home',
		message: text.trim().slice(0, PHONE_MESSAGE_MAX),
		data: {
			tag: `intercom_${now}`,
			group: 'intercom',
			channel: 'Intercom',
			clickAction: '/dashboard-home/home',
			url: '/dashboard-home/home',
		},
	};
}

/** Who a phone message is from: the signed-in household member's first name, else the wall panel ("the Kitchen wall panel"). */
export function phoneMessageSender(firstName: string | undefined, wallPanel: string | undefined): string | undefined {
	return firstName ?? (wallPanel ? `the ${wallPanel}` : undefined);
}
