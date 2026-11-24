/**
 * A camera's live view over WebRTC, with Home Assistant's stream player as the fallback.
 *
 * @module
 */

import { Car, Maximize, Minimize, Package, PawPrint, User, Volume2, VolumeX, ZoomOut } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import { useEntity, useHassApi, useHassConnection } from '../../context/HassContext';
import { type CameraDetectionType, cameraPrefix, isCameraRecording } from '../../lib/cameras';
import { cn } from '../../lib/utils';
import { formatZoom } from '../../lib/zoom';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { Badge, Button } from '../ui';
import { useCameraDetections } from './useCameraDetections';
import { usePinchZoom } from './usePinchZoom';

// HA's ha-camera-stream renders its players inside nested shadow roots, which our stylesheet
// cannot reach. Inject a fit style (cover or contain, as the camera view asks) into every shadow
// root under it (players mount asynchronously, so keep watching for new ones).
const fitCss = (fit: CameraFit) =>
	`:host{display:block;width:100%;height:100%}ha-web-rtc-player,ha-hls-player,video,img{display:block;width:100%!important;height:100%!important;max-height:none!important;object-fit:${fit}!important}`;

/** `cover` fills the view, cropping the edges (tiles); `contain` shows the whole frame (the viewer). */
export type CameraFit = 'cover' | 'contain';

function applyFit(el: Element, fit: CameraFit): () => void {
	const observers: MutationObserver[] = [];

	const visit = (node: Element) => {
		const root = node.shadowRoot;
		if (root && !root.querySelector('style[data-camera-fit]')) {
			const style = document.createElement('style');
			style.dataset.cameraFit = '';
			style.textContent = fitCss(fit);
			root.appendChild(style);

			const scan = () => {
				for (const child of root.querySelectorAll('*')) visit(child);
			};
			const observer = new MutationObserver(scan);
			observer.observe(root, { childList: true, subtree: true });
			observers.push(observer);
			scan();
		}
	};

	// The element's own shadow root is created on upgrade/first render
	const hostObserver = new MutationObserver(() => visit(el));
	hostObserver.observe(el, { childList: true, attributes: true });
	observers.push(hostObserver);
	visit(el);
	requestAnimationFrame(() => visit(el));

	return () => {
		for (const observer of observers) observer.disconnect();
	};
}

const WEBRTC_CONNECT_TIMEOUT_MS = 10000;
const MAX_WEBRTC_RETRIES = 3;
/**
 * Home Assistant's own player (ha-camera-stream) starts only when WebRTC hasn't shown a frame by
 * then, or gave up: running both doubled every camera's streams (four with the package lens).
 */
const FALLBACK_DELAY_MS = 5000;

interface WebRtcSessionEvent {
	type: 'session';
	session_id: string;
}

interface WebRtcAnswerEvent {
	type: 'answer';
	answer: string;
}

interface WebRtcCandidateEvent {
	type: 'candidate';
	candidate: RTCIceCandidateInit;
}

interface WebRtcErrorEvent {
	type: 'error';
	code: string;
	message: string;
}

type WebRtcServerEvent = WebRtcSessionEvent | WebRtcAnswerEvent | WebRtcCandidateEvent | WebRtcErrorEvent;

/** {@link WebRtcCamera}'s props. */
export interface WebRtcCameraProps {
	/** The camera entity to stream. */
	cameraEntity: string;
	/** The name on its badge (the entity's friendly name by default). */
	name?: string;
	/** The view's shape (16:9 by default); `auto` fills its container's height. */
	aspectRatio?: '16/9' | '4/3' | 'auto';
	/**
	 * `cover` (default) fills the view, cropping what doesn't fit; `contain` shows the whole frame,
	 * letterboxed over a blurred snapshot (the viewer, whose box is any shape while cameras are 16:9 or 4:3).
	 */
	fit?: CameraFit;
	/** Pinch (or the wheel) to zoom, drag to pan, double-tap to zoom in or out (the viewer's main view). */
	zoomable?: boolean;
	/** Layout classes for the view. */
	className?: string;
	/** Start playing at once (default true). */
	autoPlay?: boolean;
	/** Start muted (default true). */
	initiallyMuted?: boolean;
	/** The controls in the corner: mute, the zoom reset, full screen (default true). */
	showControls?: boolean;
	/** The badges over the top (its name, live or recording, the smart detections) and the activity frame (default true). */
	showBadges?: boolean;
	/** A full screen button (the viewer's main view); `fullscreen` makes the controls 56px. */
	onFullscreen?: () => void;
	/** Whether the view is full screen now. */
	fullscreen?: boolean;
}

/** Each smart detection's icon, for its badge. */
export const DETECTION_ICONS: Record<CameraDetectionType, React.FC<{ className?: string }>> = {
	person: User,
	animal: PawPrint,
	vehicle: Car,
	package: Package,
};

/**
 * A camera's live view: WebRTC straight from Home Assistant (under 100ms), falling back to Home
 * Assistant's own stream player, with its badges and controls over it.
 */
export const WebRtcCamera: React.FC<WebRtcCameraProps> = ({
	cameraEntity,
	name,
	aspectRatio = '16/9',
	fit = 'cover',
	zoomable = false,
	className = '',
	autoPlay = true,
	initiallyMuted = true,
	showControls = true,
	showBadges = true,
	onFullscreen,
	fullscreen = false,
}) => {
	const { getHass } = useHassApi();
	const connection = useHassConnection();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamContainerRef = useRef<HTMLDivElement | null>(null);

	const zoom = usePinchZoom(zoomable);
	const [isWebRtcPlaying, setIsWebRtcPlaying] = useState<boolean>(false);
	const [isMuted, setIsMuted] = useState<boolean>(initiallyMuted);

	// Smart detections come from entities sharing the camera's UniFi Protect device prefix
	const detections = useCameraDetections(cameraPrefix(cameraEntity));

	const cameraEntityObj = useEntity(cameraEntity);
	const recording = isCameraRecording(cameraEntityObj);
	const displayName = name || (cameraEntityObj?.attributes?.friendly_name as string) || 'Live camera';
	const entityPicture = cameraEntityObj?.attributes?.entity_picture as string | undefined;

	// WebRTC can't run here, or gave up after its retries: the fallback player takes over
	const [webRtcFailed, setWebRtcFailed] = useState(false);
	// WebRTC is taking a while: start the fallback meanwhile (until WebRTC plays)
	const [fallbackDue, setFallbackDue] = useState(false);
	useEffect(() => {
		setFallbackDue(false);
		if (isWebRtcPlaying) return;
		const timer = setTimeout(() => setFallbackDue(true), FALLBACK_DELAY_MS);
		return () => clearTimeout(timer);
	}, [isWebRtcPlaying, cameraEntity]);
	const fallbackActive = !isWebRtcPlaying && (webRtcFailed || fallbackDue);

	// Mirrors isWebRtcPlaying so the connection watchdog can read it without re-running the effect
	const playingRef = useRef(false);
	const setPlaying = (playing: boolean) => {
		playingRef.current = playing;
		setIsWebRtcPlaying(playing);
	};

	// 1. Direct Ultra-Low-Latency WebRTC Stream Pipeline (<100ms)
	useEffect(() => {
		const subscribeMessage = connection?.subscribeMessage?.bind(connection);
		setWebRtcFailed(false);
		if (!connection || !subscribeMessage || typeof RTCPeerConnection === 'undefined') {
			setPlaying(false);
			setWebRtcFailed(true);
			return;
		}

		let isCancelled = false;
		let attempt = 0;
		let pc: RTCPeerConnection | null = null;
		let unsub: (() => void) | undefined;
		let sessionId: string | null = null;
		let pendingCandidates: RTCIceCandidateInit[] = [];
		let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let gaveUp = false;

		const sendCandidate = (candidate: RTCIceCandidateInit, session: string) => {
			connection
				.sendMessagePromise({
					type: 'camera/webrtc/candidate',
					entity_id: cameraEntity,
					session_id: session,
					candidate,
				})
				.catch(() => {});
		};

		// Close the peer connection AND the HA session; an un-closed session keeps streaming server-side
		const teardown = () => {
			clearTimeout(watchdogTimer);
			if (unsub) {
				try {
					unsub();
				} catch {}
				unsub = undefined;
			}
			if (pc) {
				pc.close();
				pc = null;
			}
			sessionId = null;
			pendingCandidates = [];
			const video = videoRef.current;
			if (video) video.srcObject = null;
		};

		const scheduleRetry = () => {
			if (isCancelled) return;
			teardown();
			setPlaying(false);
			if (attempt >= MAX_WEBRTC_RETRIES) {
				console.debug(`[WebRTC] Giving up on ${cameraEntity}; using fallback stream`);
				gaveUp = true;
				setWebRtcFailed(true);
				return;
			}
			attempt += 1;
			retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 8000));
		};

		const connect = async () => {
			if (isCancelled) return;
			const peer = new RTCPeerConnection({
				iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
			});
			pc = peer;

			// Reconnect if no frames arrive in time
			watchdogTimer = setTimeout(() => {
				if (!playingRef.current) scheduleRetry();
			}, WEBRTC_CONNECT_TIMEOUT_MS);

			try {
				peer.addTransceiver('video', { direction: 'recvonly' });
				peer.addTransceiver('audio', { direction: 'recvonly' });

				peer.ontrack = (event: RTCTrackEvent) => {
					if (isCancelled || pc !== peer) return;
					const video = videoRef.current;
					if (video && event.streams[0]) {
						video.srcObject = event.streams[0];
						video.play()?.catch((err) => {
							console.debug('[WebRTC] Autoplay waiting for interaction:', err);
						});
					}
				};

				// Queue ICE candidates until session_id is received from WebSocket
				peer.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
					if (isCancelled || pc !== peer || !event.candidate) return;
					const cand = event.candidate.toJSON();
					if (sessionId) sendCandidate(cand, sessionId);
					else pendingCandidates.push(cand);
				};

				peer.onconnectionstatechange = () => {
					if (isCancelled || pc !== peer) return;
					if (peer.connectionState === 'failed') {
						scheduleRetry();
					} else if (peer.connectionState === 'disconnected') {
						// May recover on its own; the watchdog reconnects if it doesn't
						setPlaying(false);
						clearTimeout(watchdogTimer);
						watchdogTimer = setTimeout(() => {
							if (pc === peer && peer.connectionState !== 'connected') scheduleRetry();
						}, WEBRTC_CONNECT_TIMEOUT_MS);
					}
				};

				const offer = await peer.createOffer();
				await peer.setLocalDescription(offer);
				if (isCancelled || pc !== peer) return;

				const unsubscribe = await subscribeMessage<WebRtcServerEvent>(
					(event) => {
						if (isCancelled || pc !== peer) return;
						if (event.type === 'session') {
							sessionId = event.session_id;
							for (const cand of pendingCandidates) sendCandidate(cand, event.session_id);
							pendingCandidates = [];
						} else if (event.type === 'answer') {
							peer.setRemoteDescription({ type: 'answer', sdp: event.answer }).catch((err) => {
								console.debug('[WebRTC] setRemoteDescription error:', err);
								scheduleRetry();
							});
						} else if (event.type === 'candidate') {
							if (event.candidate) peer.addIceCandidate(event.candidate).catch(() => {});
						} else if (event.type === 'error') {
							console.debug(`[WebRTC] Server error for ${cameraEntity}:`, event.message);
							scheduleRetry();
						}
					},
					{
						type: 'camera/webrtc/offer',
						entity_id: cameraEntity,
						offer: offer.sdp,
					},
				);

				// The camera may have switched while HA was answering; close the session right away
				if (isCancelled || pc !== peer) {
					unsubscribe();
				} else {
					unsub = unsubscribe;
				}
			} catch (err) {
				if (!isCancelled && pc === peer) {
					console.debug('[WebRTC] Connection error:', err);
					scheduleRetry();
				}
			}
		};

		setPlaying(false);
		connect();

		// A phone back from the background (or a tablet waking) after WebRTC gave up: try it again
		const onVisible = () => {
			if (document.visibilityState !== 'visible' || !gaveUp || isCancelled) return;
			gaveUp = false;
			attempt = 0;
			setWebRtcFailed(false);
			connect();
		};
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			isCancelled = true;
			document.removeEventListener('visibilitychange', onVisible);
			clearTimeout(retryTimer);
			teardown();
		};
	}, [cameraEntity, connection]);

	// 2. Configure video element DOM attributes for mobile/kiosk autoplay compliance
	useEffect(() => {
		const video = videoRef.current;
		if (video) {
			video.muted = isMuted;
			video.defaultMuted = isMuted;
			video.setAttribute('muted', '');
			video.setAttribute('playsinline', '');
			video.setAttribute('webkit-playsinline', '');
			video.setAttribute('autoplay', '');
		}
	}, [isMuted]);

	// 3. Fallback Stream: ha-camera-stream, mounted only while WebRTC is slow or unavailable (fallbackActive)
	const streamElRef = useRef<
		| (HTMLElement & {
				hass?: HomeAssistant | null;
				stateObj?: HassEntity;
				controls?: boolean;
				muted?: boolean;
		  })
		| null
	>(null);

	useEffect(() => {
		const container = streamContainerRef.current;
		if (!container) return;

		container.innerHTML = '';
		streamElRef.current = null;

		if (fallbackActive && typeof customElements !== 'undefined' && customElements.get('ha-camera-stream')) {
			const streamEl = document.createElement('ha-camera-stream') as HTMLElement & {
				hass?: HomeAssistant | null;
				stateObj?: HassEntity;
				controls?: boolean;
				muted?: boolean;
				fitMode?: 'cover' | 'contain' | 'fill';
			};
			streamEl.style.width = '100%';
			streamEl.style.height = '100%';
			streamEl.style.display = 'block';
			const hass = getHass();
			if (hass) streamEl.hass = hass;
			if (cameraEntityObj) streamEl.stateObj = cameraEntityObj;
			streamEl.controls = false;
			streamEl.muted = isMuted;
			streamEl.fitMode = fit;

			container.appendChild(streamEl);
			streamElRef.current = streamEl;
			const stopFit = applyFit(streamEl, fit);

			return () => {
				stopFit();
				container.innerHTML = '';
				streamElRef.current = null;
			};
		}
	}, [cameraEntity, fallbackActive, fit]);

	// Update fallback stream properties in-place (hass with the camera's state, not every update)
	useEffect(() => {
		const streamEl = streamElRef.current;
		if (!streamEl) return;
		const hass = getHass();
		if (hass && streamEl.hass !== hass) {
			streamEl.hass = hass;
		}
		if (cameraEntityObj && streamEl.stateObj !== cameraEntityObj) {
			streamEl.stateObj = cameraEntityObj;
		}
	}, [cameraEntityObj]);

	const toggleMute = () => {
		const nextMuted = !isMuted;
		setIsMuted(nextMuted);
		if (videoRef.current) {
			videoRef.current.muted = nextMuted;
			if (!nextMuted) {
				videoRef.current.volume = 1.0;
				videoRef.current.play().catch(() => {});
			}
		}
		if (streamElRef.current) {
			streamElRef.current.muted = nextMuted;
		}
	};

	const aspectClass = aspectRatio === '16/9' ? 'aspect-video' : aspectRatio === '4/3' ? 'aspect-4/3' : 'h-full';

	return (
		<div
			data-camera={cameraEntity}
			// isolate: its own stacking layer, so the snapshot (-z-10) paints over the black, under the video
			className={cn(
				'relative isolate w-full select-none overflow-hidden rounded-lg border bg-black',
				aspectClass,
				className,
			)}
			style={{ touchAction: zoom.touchAction }}
			{...zoom.handlers}
		>
			{/* What zooms: the video and the fallback player, never the badges and controls over them */}
			<div className="absolute inset-0 z-10" style={zoom.style}>
				{/* Hardware-Accelerated Native WebRTC Stream (<100ms Ultra-Low Latency) */}
				<video
					ref={videoRef}
					autoPlay={autoPlay}
					playsInline
					muted={isMuted}
					onTimeUpdate={() => {
						const video = videoRef.current;
						if (video && video.videoWidth > 0 && video.currentTime > 0 && !isWebRtcPlaying) {
							setPlaying(true);
						}
					}}
					onPlaying={() => {
						const video = videoRef.current;
						if (video && video.videoWidth > 0 && !isWebRtcPlaying) {
							setPlaying(true);
						}
					}}
					className={`absolute inset-0 z-10 size-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} transition-opacity duration-300 ${
						isWebRtcPlaying ? 'opacity-100' : 'pointer-events-none opacity-0'
					}`}
				/>

				{/* Fallback Stream Mount Point (filled only while WebRTC is slow or unavailable) */}
				<div
					ref={streamContainerRef}
					className={`absolute inset-0 overflow-hidden transition-opacity duration-300 ${
						isWebRtcPlaying ? 'pointer-events-none opacity-0' : 'opacity-100'
					}`}
				/>
			</div>

			{/* Fallback Static Snapshot Poster (Displayed while streams are initiating) */}
			{entityPicture && (
				<img
					src={entityPicture}
					// Decorative: the badge names the camera
					alt=""
					loading="eager"
					className="pointer-events-none absolute inset-0 -z-10 size-full object-cover opacity-40 blur-xs"
				/>
			)}

			{/* Something is happening on camera: pulsing amber frame around the viewport */}
			{showBadges && detections.length > 0 && (
				<div
					data-slot="camera-activity"
					className="pointer-events-none absolute inset-0 z-30 animate-pulse rounded-lg border-4 border-warning"
				/>
			)}

			{/* Top Bar Overlay: Live Badge & Detection Badges (overlaid on video, so always dark) */}
			{showBadges && (
				<div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-center justify-between">
					<div className="flex flex-wrap items-center gap-1.5">
						<Badge
							variant="secondary"
							className="bg-black/60 text-white"
							title={recording ? 'Recording' : 'Live (not recording)'}
						>
							{/* Pulsing red while UniFi Protect is recording, steady green when only live */}
							<span className="relative flex size-2">
								{recording && <span className="absolute inset-0 animate-ping rounded-full bg-destructive" />}
								<span className={cn('relative size-2 rounded-full', recording ? 'bg-destructive' : 'bg-success')} />
							</span>
							{displayName}
							{recording && <span className="font-semibold text-destructive tracking-wide">REC</span>}
						</Badge>

						{detections.map((detection) => {
							const Icon = DETECTION_ICONS[detection.type];
							return (
								<Badge key={detection.type} variant="warning">
									<Icon /> {detection.label}
								</Badge>
							);
						})}
					</div>

					<Badge variant="secondary" className="bg-black/60 text-white">
						{isWebRtcPlaying ? 'WebRTC · <100ms' : fallbackActive ? 'Live stream' : 'Connecting…'}
					</Badge>
				</div>
			)}

			{/* Bottom Controls Cluster */}
			{showControls && (
				<div
					className={cn(
						'absolute right-3 bottom-3 z-20 flex items-center gap-2',
						fullscreen && 'right-4 bottom-[max(--spacing(4),env(safe-area-inset-bottom))] gap-3',
					)}
				>
					{/* Zoomed in: how far, and a tap back out (double-tapping the video does it too) */}
					{zoom.zoom.scale > 1 && (
						<Button
							variant="secondary"
							size={fullscreen ? '2xl' : 'lg'}
							onClick={zoom.reset}
							title="Zoom out"
							aria-label={`Zoomed ${formatZoom(zoom.zoom.scale)}; zoom out`}
							className="tabular-nums"
						>
							<ZoomOut />
							{formatZoom(zoom.zoom.scale)}
						</Button>
					)}
					<Button
						variant={isMuted ? 'secondary' : 'default'}
						size={fullscreen ? 'icon-2xl' : 'icon-lg'}
						onClick={toggleMute}
						title={isMuted ? 'Unmute live audio' : 'Mute live audio'}
						aria-label={isMuted ? 'Unmute live audio' : 'Mute live audio'}
					>
						{isMuted ? <VolumeX /> : <Volume2 />}
					</Button>

					{onFullscreen && (
						<Button
							variant="secondary"
							size={fullscreen ? 'icon-2xl' : 'icon-lg'}
							onClick={() => {
								zoom.reset();
								onFullscreen();
							}}
							title={fullscreen ? 'Exit full screen' : 'Full screen'}
							aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
						>
							{fullscreen ? <Minimize /> : <Maximize />}
						</Button>
					)}
				</div>
			)}
		</div>
	);
};
