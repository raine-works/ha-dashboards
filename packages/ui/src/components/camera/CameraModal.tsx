/**
 * The Cameras dialog and the camera thumbnails the dashboards share.
 *
 * @module
 */

import { History, Loader2, MessageSquareText, Radio, VideoOff } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { CAMERAS_WATCH, type CameraDevice, discoverCameras, findCamera, talkbackPresets } from '../../lib/cameras';
import { HOLIDAY_MESSAGES } from '../../lib/holidayMessages';
import { serviceErrorMessage } from '../../lib/service-calls';
import { speakWithFallback } from '../../lib/tts';
import { cn } from '../../lib/utils';
import { encodeWavDataUri } from '../../lib/wav';
import type { HomeAssistant } from '../../types/homeassistant';
import { MessageComposer } from '../audio/MessageComposer';
import { HolidayCharacter } from '../holiday/HolidayEgg';
import { useHoliday } from '../holiday/useHoliday';
import {
	Badge,
	Button,
	ChipRow,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	toast,
	useOpenDialogCount,
} from '../ui';
import { CameraClips } from './CameraClips';
import { useCameraDetections } from './useCameraDetections';
import { useCameraSnapshot } from './useCameraSnapshot';
import { useFullscreen } from './useFullscreen';
import { DETECTION_ICONS, WebRtcCamera } from './WebRtcCamera';

/** How long a talkback message may take to start playing, then to finish, before the next goes anyway. */
const TALKBACK_START_MS = 10_000;
const TALKBACK_MAX_MS = 60_000;

// Each camera speaker's messages, one after another: a message sent while another plays cuts it off
const talkbackQueues = new Map<string, Promise<unknown>>();

/** Run `speak` once the speaker's earlier messages are done; resolves or rejects with it. */
function queueTalkback(speaker: string, speak: () => Promise<void>): Promise<void> {
	const turn = (talkbackQueues.get(speaker) ?? Promise.resolve()).then(speak);
	const settled = turn.catch(() => {});
	talkbackQueues.set(speaker, settled);
	void settled.then(() => {
		if (talkbackQueues.get(speaker) === settled) talkbackQueues.delete(speaker);
	});
	return turn;
}

/** {@link CameraModal}'s props. */
export interface CameraModalProps {
	/** Whether the dialog is open. */
	isOpen: boolean;
	/** Called when it's dismissed (or closes itself after `idleTimeoutMs`). */
	onClose: () => void;
	/**
	 * Camera entity to select when opening: any of a device's streams, or its package lens (which
	 * then opens as the main view).
	 */
	initialCamera?: string;
	/** Auto-close after this long without interaction (Dialog default when omitted). */
	idleTimeoutMs?: number;
}

/**
 * A camera's near-live snapshot (`useCameraSnapshot`: a new frame every 5s while in view), blurred
 * under "Updating…" whenever the frame shown is out of date, so it's never taken for the present (the
 * viewer's sidebar, the dashboard's camera grid, Security's cameras card).
 */
export const CameraThumbnail: React.FC<{
	camera: CameraDevice;
	selected?: boolean;
	onSelect: () => void;
	/** Dim the snapshot until hovered or selected (the viewer's sidebar). */
	dim?: boolean;
	className?: string;
}> = ({ camera, selected = false, onSelect, dim = true, className }) => {
	const detections = useCameraDetections(camera.id);
	// No frames nobody can see: off screen, or under a dialog it isn't part of (the Cameras card under
	// the camera viewer, which has its own thumbnails and the live video)
	const [element, setElement] = useState<HTMLButtonElement | null>(null);
	const [onScreen, setOnScreen] = useState(true);
	const [inDialog, setInDialog] = useState(false);
	const dialogs = useOpenDialogCount();
	useEffect(() => {
		if (!element) return;
		setInDialog(!!element.closest('[data-slot="dialog-content"]'));
		const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	const snapshot = useCameraSnapshot(camera.entityId, camera.available && onScreen && (inDialog || dialogs === 0));

	return (
		<button
			ref={setElement}
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			aria-label={camera.label}
			className={cn(
				'group relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border bg-muted outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary',
				className,
			)}
		>
			{camera.available ? (
				<>
					{snapshot.src && (
						<img
							src={snapshot.src}
							alt=""
							className={cn(
								'size-full object-cover transition-[opacity,filter]',
								dim && 'opacity-60 group-hover:opacity-100 group-aria-pressed:opacity-100',
								snapshot.stale && 'opacity-40 blur-sm group-hover:opacity-40 group-aria-pressed:opacity-40',
							)}
						/>
					)}
					{/* Out of date (or not in yet): never passed off as what's happening now */}
					{snapshot.stale && (
						<span className="absolute inset-0 flex items-center justify-center">
							<Badge variant="secondary" className="bg-black/60 text-white">
								<Loader2 className="animate-spin" />
								Updating…
							</Badge>
						</span>
					)}
				</>
			) : (
				<div className="flex size-full items-center justify-center text-muted-foreground">
					<VideoOff className="size-6" />
				</div>
			)}
			{/* Which cameras have something happening, without opening each one */}
			{detections.length > 0 && (
				<div className="absolute top-1.5 right-1.5 flex gap-1">
					{detections.map((detection) => {
						const Icon = DETECTION_ICONS[detection.type];
						return (
							<Badge key={detection.type} variant="warning" className="px-1" title={detection.label}>
								<Icon />
							</Badge>
						);
					})}
				</div>
			)}
			<div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-white">
				<span className="truncate font-medium text-sm">{camera.label}</span>
				{!camera.available && (
					<Badge variant="secondary" className="bg-black/60 text-white">
						Offline
					</Badge>
				)}
			</div>
		</button>
	);
};

/**
 * The Cameras dialog: a camera's live view (with its smart detections, fullscreen, and talkback on
 * one with a speaker), its recorded clips, and every camera's thumbnail to switch to.
 */
export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, initialCamera, idleTimeoutMs }) => {
	const { callService, getHass, waitFor } = useHassApi();
	const [activeCamId, setActiveCamId] = useState<string | undefined>();
	const [isPipSwapped, setIsPipSwapped] = useState<boolean>(false);
	// The talkback preset on its way to the camera speaker (one at a time); typed messages queue (`queueTalkback`)
	const [sendingTts, setSendingTts] = useState<string | null>(null);
	// A typed message for the camera's speaker
	const [ttsText, setTtsText] = useState('');
	// Live view, or the camera's recorded events (UniFi Protect clips)
	const [tab, setTab] = useState<'live' | 'clips'>('live');
	const [liveView, setLiveView] = useState<HTMLDivElement | null>(null);
	const liveFull = useFullscreen(liveView);

	const cameras = useHassSelector((hass) => (isOpen && hass ? discoverCameras(hass.states) : []), {
		watch: CAMERAS_WATCH,
	});

	const initial = initialCamera ? findCamera(cameras, initialCamera) : undefined;

	// The modal stays mounted while closed, so forget the last pick: every open starts on
	// initialCamera (a doorbell ring, a notification's link) or the first camera in the list, with
	// the package lens as the main view when that's the camera asked for
	const startOnPackageLens = !!initial?.packageLens;
	useEffect(() => {
		if (isOpen) setIsPipSwapped(startOnPackageLens);
		else {
			setActiveCamId(undefined);
			setIsPipSwapped(false);
			setTab('live');
		}
	}, [isOpen, initialCamera, startOnPackageLens]);

	const activeCam = cameras.find((c) => c.id === activeCamId) || initial?.camera || cameras[0];
	// In a holiday's days its talkback lines lead (trick-or-treaters at the doorbell), each with the
	// holiday's character, as the intercom's holiday category has its emoji
	const holiday = useHoliday()?.holiday.id;
	const holidayLines = holiday ? [...HOLIDAY_MESSAGES[holiday].doorbell, ...HOLIDAY_MESSAGES[holiday].indoor] : [];

	if (!activeCam) {
		return (
			<Dialog open={isOpen} onOpenChange={(val) => !val && onClose()} idleTimeoutMs={idleTimeoutMs}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cameras</DialogTitle>
						<DialogDescription>No cameras found in Home Assistant</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	// Determine main vs PIP entities
	const mainEntity = isPipSwapped ? activeCam.pipEntityId || activeCam.entityId : activeCam.entityId;
	const pipEntity = isPipSwapped ? activeCam.entityId : activeCam.pipEntityId || null;

	const handleSendTts = (message: string, typed = false) => {
		const trimmed = message.trim();
		const speaker = activeCam.speakerEntity;
		if (!trimmed || !speaker || (!typed && sendingTts)) return;
		// A typed message leaves its box at once, and the next can follow
		if (typed) setTtsText('');
		else setSendingTts(trimmed);
		const camera = activeCam.label;
		queueTalkback(speaker, async () => {
			await speakWithFallback(
				(data) => callService('tts', 'speak', data, { errors: 'throw' }),
				speaker,
				trimmed,
				getHass()?.states,
			);
			// Done once it's been said: a message sent meanwhile would cut it off
			const isPlaying = (hass: HomeAssistant) => hass.states[speaker]?.state === 'playing';
			if (await waitFor(isPlaying, TALKBACK_START_MS)) await waitFor((hass) => !isPlaying(hass), TALKBACK_MAX_MS);
		})
			.catch((err) => {
				toast.error(`Couldn't speak at ${camera}`, { description: serviceErrorMessage(err) });
				// Put a failed message back to try again, unless something new was typed meanwhile
				if (typed) setTtsText((current) => current || trimmed);
			})
			.finally(() => {
				if (!typed) setSendingTts(null);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={(val) => !val && onClose()} idleTimeoutMs={idleTimeoutMs}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>Cameras</DialogTitle>
					<DialogDescription className="short:hidden">
						{tab === 'clips'
							? `${activeCam.label} · Recorded events`
							: activeCam.pipEntityId
								? 'Tap the inset view to swap lenses'
								: `${cameras.length} ${cameras.length === 1 ? 'camera' : 'cameras'} · Live view`}
					</DialogDescription>
				</DialogHeader>

				{/* Phones: the camera list becomes a strip under the video */}
				<div className="flex min-h-0 flex-1 gap-4 max-md:flex-col-reverse max-md:gap-3">
					{/* Camera List (p-1 leaves room for the selection ring offset) */}
					<nav
						aria-label="Cameras"
						className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto p-1 max-md:w-full max-md:flex-row max-md:overflow-x-auto max-md:overflow-y-hidden"
					>
						{cameras.map((cam) => (
							<CameraThumbnail
								key={cam.id}
								camera={cam}
								selected={cam.id === activeCam.id}
								onSelect={() => {
									setActiveCamId(cam.id);
									setIsPipSwapped(false);
								}}
								className="max-md:w-36"
							/>
						))}
					</nav>

					<Tabs
						value={tab}
						onValueChange={(value) => setTab(value as 'live' | 'clips')}
						className="min-h-0 min-w-0 flex-1 gap-4 p-1 max-md:gap-3 max-md:overflow-y-auto"
					>
						<TabsList>
							<TabsTrigger value="live" className="px-4">
								<Radio />
								Live
							</TabsTrigger>
							<TabsTrigger value="clips" className="px-4">
								<History />
								Clips
							</TabsTrigger>
						</TabsList>

						{/* Recorded events (keyed per camera so its filters and pick start fresh) */}
						<TabsContent value="clips" className="flex min-h-0 flex-col">
							<CameraClips key={activeCam.id} camera={activeCam} />
						</TabsContent>

						<TabsContent value="live" className="flex min-h-0 flex-col gap-4 max-md:gap-3">
							{/* Main Video Area with Interactive Picture-in-Picture: what goes full screen */}
							<div
								ref={setLiveView}
								className={cn(
									'relative min-h-0 w-full flex-1 max-md:min-h-56',
									liveFull.fullscreen && 'bg-black',
									// Filling the window where the browser's full screen isn't available (below the toolbar)
									liveFull.windowFull && 'fixed inset-x-0 top-(--panel-top) bottom-0 z-55 flex-none',
								)}
							>
								<WebRtcCamera
									key={mainEntity}
									cameraEntity={mainEntity}
									name={activeCam.label}
									aspectRatio="auto"
									// The whole frame, whatever shape the dialog leaves it (the doorbell is 4:3, others 16:9)
									fit="contain"
									zoomable
									showControls={true}
									showBadges={true}
									onFullscreen={liveFull.toggle}
									fullscreen={liveFull.fullscreen}
									className={cn(liveFull.fullscreen && 'rounded-none border-0')}
								/>

								{pipEntity && (
									<button
										type="button"
										onClick={() => setIsPipSwapped(!isPipSwapped)}
										aria-label="Swap main and picture-in-picture camera feed"
										title="Tap to swap main and PIP camera"
										className="absolute bottom-2 left-2 z-20 h-20 w-28 cursor-pointer overflow-hidden rounded-lg border-2 bg-black md:bottom-4 md:left-4 md:h-40 md:w-60"
									>
										<WebRtcCamera
											key={pipEntity}
											cameraEntity={pipEntity}
											aspectRatio="auto"
											className="pointer-events-none rounded-none border-0"
											showControls={false}
											showBadges={false}
										/>
									</button>
								)}
							</div>

							{/* Talkback: quick TTS presets, then a typed or recorded message */}
							{activeCam.speakerEntity && (
								<div className="flex shrink-0 flex-col gap-3 border-t pt-4 max-md:pt-3">
									<ChipRow>
										<MessageSquareText className="mr-1 size-5 text-muted-foreground" />
										{talkbackPresets(activeCam, holiday).map((preset) => (
											<Button
												key={preset}
												variant="outline"
												size="lg"
												onClick={() => handleSendTts(preset)}
												loading={sendingTts === preset}
												disabled={sendingTts !== null && sendingTts !== preset}
											>
												{holiday && holidayLines.includes(preset) && (
													<HolidayCharacter id={holiday} className="size-5" />
												)}
												{preset}
											</Button>
										))}
									</ChipRow>

									{/* Keyed by speaker so a pending recording is never sent to a different camera */}
									<MessageComposer
										key={activeCam.speakerEntity}
										text={ttsText}
										onTextChange={setTtsText}
										onSendText={(text) => handleSendTts(text, true)}
										placeholder={`Say something at ${activeCam.label}…`}
										inputLabel={`Message to speak at ${activeCam.label}`}
										sendLabel="Speak"
										targetLabel="camera speaker"
										// A failure throws, so the composer says why and keeps the recording to try again
										onSendRecording={async (recording) => {
											await callService(
												'media_player',
												'play_media',
												{
													entity_id: activeCam.speakerEntity,
													// 200ms head lets the camera speaker DAC un-mute; 500ms tail avoids cutting off the last word
													media_content_id: encodeWavDataUri(recording.samples, recording.sampleRate, 0.2, 0.5),
													media_content_type: 'music',
												},
												{ errors: 'throw' },
											).catch((err) => {
												throw new Error(serviceErrorMessage(err) ?? `Couldn't play it at ${activeCam.label}`);
											});
										}}
									/>
								</div>
							)}
						</TabsContent>
					</Tabs>
				</div>
			</DialogContent>
		</Dialog>
	);
};
