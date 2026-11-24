/**
 * The Messages dialog (the intercom): announcements on the speakers and TVs (quick or typed, or a
 * recorded voice clip), messages to household phones, and notes on the receipt printer.
 *
 * @module
 */

import { Bell, Printer, Smartphone, Speaker, Tv, Volume2 } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady, useHassSelector } from '../../context/HassContext';
import { withHolidayCategory } from '../../lib/holidayMessages';
import {
	ANNOUNCEMENT_PRESETS,
	type BroadcastOptions,
	broadcastRecording,
	broadcastText,
	discoverIntercomSpeakers,
	intercomTargetLabel,
	purgeStaleRecordings,
} from '../../lib/intercom';
import { readStoredJson, writeStored } from '../../lib/storage';
import { discoverTvs, TVS_WATCH } from '../../lib/tv';
import { MessageComposer } from '../audio/MessageComposer';
import { withHolidayChime } from '../holiday/holidaySounds';
import { useHoliday } from '../holiday/useHoliday';
import { SectionGroup } from '../layout/Section';
import { usePrinter } from '../printer/usePrinter';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	Separator,
	Slider,
	SwitchRow,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '../ui';
import { CheckRow } from '../ui/check-row';
import { PhoneMessages } from './PhoneMessages';
import { PresetPicker } from './PresetPicker';
import { PrintNotes } from './PrintNotes';

// How often the always-open wall panel sweeps leftover voice clips from HA media
const RECORDING_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// Per-panel convenience: remember the last speaker selection and audio settings
const SETTINGS_KEY = 'panel-ui:intercom';

interface IntercomSettings {
	speakers: string[];
	/** TVs to say it on too (spoken over what's on) */
	tvs: string[];
	volume: number;
	chime: boolean;
	/** Announce on the speakers, message household phones, or print a note on the receipt printer */
	mode: 'speakers' | 'phones' | 'notes';
	/** The people a phone message goes to (person entities) */
	people: string[];
}

function loadSettings(): IntercomSettings {
	const defaults: IntercomSettings = { speakers: [], tvs: [], volume: 75, chime: true, mode: 'speakers', people: [] };
	return { ...defaults, ...(readStoredJson(SETTINGS_KEY) as Partial<IntercomSettings> | undefined) };
}

/** The Messages dialog's props: whether it's open, and what closes it. */
export interface IntercomDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

/**
 * The Messages dialog: Speakers (announce to the picked speakers and TVs, with a volume and chime),
 * Phones and, with a receipt printer, Notes. The tab, speakers and settings are remembered per
 * device. It stays mounted in the header, so it also sweeps leftover voice clips from Home
 * Assistant's media hourly.
 */
export const IntercomDialog: React.FC<IntercomDialogProps> = ({ isOpen, onClose }) => {
	const { getHass } = useHassApi();
	// In a holiday's days its quick announcements come first (and open)
	const holiday = useHoliday()?.holiday.id;
	const [settings, setSettings] = useState<IntercomSettings>(loadSettings);
	const [message, setMessage] = useState('');
	// The quick announcement being sent (one at a time); typed ones queue behind it in Home Assistant
	const [sending, setSending] = useState<string | null>(null);
	const [status, setStatus] = useState<{ text: string; isError?: boolean } | null>(null);

	// This component stays mounted in the header, so sweep at startup and then hourly
	const isConnected = useHassReady();
	useEffect(() => {
		if (!isConnected) return;
		const sweep = () => {
			const current = getHass();
			if (current) purgeStaleRecordings(current).catch((err) => console.warn('[Intercom] Clip sweep failed:', err));
		};
		sweep();
		const timer = setInterval(sweep, RECORDING_SWEEP_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [isConnected]);

	useEffect(() => writeStored(SETTINGS_KEY, JSON.stringify(settings)), [settings]);

	// Clear success confirmations after a moment
	useEffect(() => {
		if (!status || status.isError) return;
		const timer = setTimeout(() => setStatus(null), 3000);
		return () => clearTimeout(timer);
	}, [status]);

	// The receipt printer (the first, if there are several); without one there's no Notes tab
	const printer = usePrinter();
	const mode = settings.mode === 'notes' && !printer ? 'speakers' : settings.mode;

	const speakers = useHassSelector((hass) => (isOpen && hass ? discoverIntercomSpeakers(hass.states, hass) : []), {
		watch: ['media_player'],
	});
	// A speaker playing its TV's sound sits announcements out: one would cut into whatever's on
	const availableIds = speakers.filter((s) => s.available && !s.tvAudio).map((s) => s.entityId);
	// Ignore remembered speakers that have since gone away, offline or over to the TV
	const selected = settings.speakers.filter((id) => availableIds.includes(id));

	// The TVs (Raineworks TV): only one that's on can be picked, since a TV asleep would wake to say it
	const tvs = useHassSelector((hass) => (isOpen && hass ? discoverTvs(hass.states, hass) : []), { watch: TVS_WATCH });
	const tvsOn = tvs.filter((tv) => tv.state === 'on').map((tv) => tv.entityId);
	const selectedTvs = settings.tvs.filter((id) => tvsOn.includes(id));

	const update = (patch: Partial<IntercomSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
	const toggleTv = (entityId: string) =>
		update({
			tvs: selectedTvs.includes(entityId) ? selectedTvs.filter((id) => id !== entityId) : [...selectedTvs, entityId],
		});
	const toggleSpeaker = (entityId: string) =>
		update({
			speakers: selected.includes(entityId) ? selected.filter((id) => id !== entityId) : [...selected, entityId],
		});

	const nameOf = (id: string) =>
		speakers.find((s) => s.entityId === id)?.name ?? tvs.find((tv) => tv.entityId === id)?.name ?? id;
	const targetLabel = intercomTargetLabel(selected, selectedTvs, nameOf);
	const blockedReason =
		selected.length === 0 && selectedTvs.length === 0 ? 'Select at least one speaker or TV' : undefined;
	const options: BroadcastOptions = {
		speakers: selected,
		tvs: selectedTvs,
		volume: settings.volume,
		chime: settings.chime,
	};

	// A promise chain, not try/finally: the React Compiler can't take a finally clause
	const announce = (text: string, typed = false) => {
		const trimmed = text.trim();
		const hass = getHass();
		if (!hass || !trimmed || blockedReason || (!typed && sending)) return;
		setStatus(null);
		// A typed message leaves its box at once and the next can follow: script.play_announcement
		// is queued, and answers only once its message has been spoken
		if (typed) setMessage('');
		else setSending(trimmed);
		void broadcastText(hass, trimmed, options)
			.then(() => setStatus({ text: `Announcement sent to ${targetLabel}` }))
			.catch((err) => {
				console.error('Failed to broadcast announcement:', err);
				setStatus({ text: `Couldn't play the announcement on ${targetLabel}`, isError: true });
				// Put a failed message back to try again, unless something new was typed meanwhile
				if (typed) setMessage((current) => current || trimmed);
			})
			.finally(() => {
				if (!typed) setSending(null);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>Messages</DialogTitle>
					<DialogDescription className="short:hidden">
						{mode === 'phones'
							? 'Send a message to household phones'
							: mode === 'notes' && printer
								? `Print a note on the ${printer.printer.name}`
								: selected.length > 0
									? `Broadcasting to ${targetLabel}`
									: 'Choose which speakers and TVs to broadcast to'}
					</DialogDescription>
				</DialogHeader>

				<Tabs
					value={mode}
					onValueChange={(mode) => update({ mode: mode as IntercomSettings['mode'] })}
					className="flex min-h-0 flex-1 flex-col gap-4 short:gap-2"
				>
					<TabsList>
						<TabsTrigger value="speakers" className="px-4">
							<Speaker />
							Speakers
						</TabsTrigger>
						<TabsTrigger value="phones" className="px-4">
							<Smartphone />
							Phones
						</TabsTrigger>
						{printer && (
							<TabsTrigger value="notes" className="px-4">
								<Printer />
								Notes
							</TabsTrigger>
						)}
					</TabsList>

					<TabsContent value="phones" className="flex min-h-0 flex-col">
						<PhoneMessages active={isOpen} recipients={settings.people} onRecipients={(people) => update({ people })} />
					</TabsContent>

					{printer && (
						<TabsContent value="notes" className="flex min-h-0 flex-col">
							<PrintNotes printer={printer} />
						</TabsContent>
					)}

					<TabsContent value="speakers" className="flex min-h-0 flex-col">
						{/* Phones: speakers, then the quick announcements, then the spare height, then the volume and
				    message box at the bottom edge (the whole tab scrolls when it doesn't fit, e.g. with the keyboard up) */}
						<div className="flex min-h-0 flex-1 gap-6 short:gap-4 max-md:flex-col max-md:gap-4 max-md:overflow-y-auto">
							{/* Who hears it: the speakers, then the TVs, each a group of check rows on one surface */}
							<div className="flex w-72 shrink-0 flex-col gap-gap overflow-y-auto p-0.5 max-md:w-full max-md:overflow-visible">
								<SectionGroup
									label="Speakers"
									surface
									actions={
										speakers.length > 1 && (
											<>
												<Button variant="ghost" size="sm" onClick={() => update({ speakers: availableIds })}>
													All
												</Button>
												<Button variant="ghost" size="sm" onClick={() => update({ speakers: [] })}>
													None
												</Button>
											</>
										)
									}
								>
									{speakers.length === 0 && (
										<EmptyState icon={<Speaker className="size-10" />}>No Music Assistant speakers found.</EmptyState>
									)}
									{speakers.map((speaker) => (
										<CheckRow
											key={speaker.entityId}
											label={speaker.name}
											checked={selected.includes(speaker.entityId)}
											onCheckedChange={() => toggleSpeaker(speaker.entityId)}
											disabled={!speaker.available || speaker.tvAudio}
											detail={
												!speaker.available
													? 'Offline'
													: speaker.tvAudio
														? 'Playing the TV'
														: speaker.isPlaying
															? 'Playing'
															: undefined
											}
										/>
									))}
								</SectionGroup>
								{tvs.length > 0 && (
									<SectionGroup label="TVs" surface>
										{tvs.map((tv) => (
											<CheckRow
												key={tv.entityId}
												label={tv.name}
												icon={<Tv />}
												checked={selectedTvs.includes(tv.entityId)}
												onCheckedChange={() => toggleTv(tv.entityId)}
												// Only a TV that's on: one asleep would wake to say it
												disabled={tv.state !== 'on'}
												detail={tv.state === 'on' ? undefined : tv.state === 'unavailable' ? 'Offline' : 'Off'}
											/>
										))}
									</SectionGroup>
								)}
							</div>

							<Separator orientation="vertical" className="max-md:hidden" />

							{/* Message Composer */}
							<div className="flex min-w-0 flex-1 flex-col gap-5 short:gap-3 overflow-y-auto overflow-x-hidden p-1 max-md:flex-auto max-md:overflow-visible">
								{/* Fills the spare height so the volume and message box sit at the bottom (on phones the
						    space goes above the volume instead), its chips scrolling inside it; when the keyboard shortens the
						    dialog below two rows of them, the column scrolls instead */}
								<PresetPicker
									title="Quick announcements"
									categories={withHolidayCategory(ANNOUNCEMENT_PRESETS, holiday, (m) => m.announcements)}
									storageKey="panel-ui:intercom-announcement-category"
								>
									{(preset) => (
										<Button
											key={preset.label}
											variant="outline"
											size="lg"
											onClick={() => announce(preset.message)}
											loading={sending === preset.message}
											disabled={!!blockedReason || (sending !== null && sending !== preset.message)}
											title={blockedReason ?? preset.message}
										>
											{preset.label}
										</Button>
									)}
								</PresetPicker>

								{/* The volume over the message box, which sits at the bottom edge (on phones the
								    quick announcements stay under the speakers, the spare height between) */}
								<div className="flex items-center gap-6 max-md:mt-auto">
									<div className="flex flex-1 items-center gap-3">
										<Volume2 className="size-5 shrink-0 text-muted-foreground" />
										<Slider
											min={10}
											max={100}
											step={5}
											value={settings.volume}
											onValueChange={(volume) => update({ volume })}
											aria-label="Announcement volume"
										/>
										<span className="min-w-10 text-right font-mono text-muted-foreground text-sm tabular-nums">
											{settings.volume}%
										</span>
									</div>
									{/* The whole label is the touch target */}
									<SwitchRow
										checked={settings.chime}
										onCheckedChange={(chime) => update({ chime })}
										aria-label="Play chime before announcement"
										className="-mx-2 gap-2 rounded-md px-2 py-1 font-medium text-sm"
									>
										<Bell className="size-4 text-muted-foreground" />
										Chime
									</SwitchRow>
								</div>

								<MessageComposer
									text={message}
									onTextChange={setMessage}
									onSendText={(text) => announce(text, true)}
									placeholder="Type an announcement…"
									inputLabel="Announcement message"
									sendLabel="Announce"
									targetLabel={targetLabel}
									sendBlockedReason={blockedReason}
									status={status}
									onSendRecording={async (recording) => {
										const hass = getHass();
										if (!hass) throw new Error('Home Assistant connection not ready');
										// In a holiday's days its sound is the chime, spliced in front of the recording
										const chimed = options.chime
											? await withHolidayChime(recording.samples, recording.sampleRate)
											: null;
										await broadcastRecording(
											hass,
											chimed ?? recording.samples,
											recording.sampleRate,
											chimed ? { ...options, chime: false } : options,
										);
									}}
								/>
							</div>
						</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
