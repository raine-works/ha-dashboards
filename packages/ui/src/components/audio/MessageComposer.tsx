/**
 * The message composer: type or record a message for the speakers (the intercom, a camera's
 * speaker), with the recording's waveform and playback before it's sent.
 *
 * @module
 */

import { Check, Loader2, Mic, Pause, Play, Send, Square, Trash2 } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import { cn } from '../../lib/utils';
import { computeWaveformPeaks, downsampleBuffer, encodeWavDataUri, formatDuration, mergeChunks } from '../../lib/wav';
import { Button, Input } from '../ui';
import { resample, startCapture } from './capture';

const TARGET_SAMPLE_RATE = 16000;
const MIN_RECORD_SECONDS = 0.5;
const HOLD_TO_TALK_MS = 900;
const PRE_BUFFER_CHUNKS = 4; // ~170ms at 2048 samples/48kHz, so the first word isn't clipped
const LIVE_BAR_COUNT = 24;
const WAVEFORM_BAR_COUNT = 44;

type RecordState = 'idle' | 'recording' | 'review' | 'sending' | 'sent';

/** A finished recording, handed to `onSendRecording`. */
export interface Recording {
	/** 16kHz mono PCM, ready to encode for the destination speaker. */
	samples: Float32Array;
	/** The samples' rate, in Hz. */
	sampleRate: number;
	/** A WAV data URI of the recording, for playing it back before it's sent. */
	previewUri: string;
	/** Its length, in seconds. */
	duration: number;
	/** The waveform's bar heights (0–1). */
	peaks: number[];
}

interface OpenMic {
	stream: MediaStream;
	context: AudioContext;
	nodes: AudioNode[];
}

/** Stop the mic (its indicator goes off) and the audio graph reading it. */
function closeMic({ stream, context, nodes }: Partial<OpenMic> & { stream: MediaStream }) {
	for (const track of stream.getTracks()) track.stop();
	for (const node of nodes ?? []) {
		try {
			node.disconnect();
		} catch {}
	}
	context?.close().catch(() => {});
}

/** The audio graph for an open mic stream, feeding `onChunk`; on failure the stream is closed too. */
async function openCapture(stream: MediaStream, onChunk: (chunk: Float32Array) => void): Promise<OpenMic> {
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	let context: AudioContext | undefined;
	try {
		if (!AudioContextClass) throw new Error('Web Audio is not supported');
		context = new AudioContextClass();
		const nodes = await startCapture(context, context.createMediaStreamSource(stream), onChunk);
		return { stream, context, nodes };
	} catch (err) {
		closeMic({ stream, context });
		throw err;
	}
}

/** Microphone capture on the audio thread (capture.ts), resampled to 16kHz. */
function useVoiceRecorder(maxSeconds: number) {
	const [state, setState] = useState<RecordState>('idle');
	const [error, setError] = useState<string | null>(null);
	const [recording, setRecording] = useState<Recording | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [level, setLevel] = useState(0);

	const micRef = useRef<OpenMic | null>(null);
	const levelRef = useRef(0);
	const isRecordingRef = useRef(false);
	const samplesRef = useRef<Float32Array[]>([]);
	const preBufferRef = useRef<Float32Array[]>([]);
	const startTimeRef = useRef(0);
	const frameRef = useRef<number | null>(null);

	const releaseMic = () => {
		if (frameRef.current) cancelAnimationFrame(frameRef.current);
		frameRef.current = null;
		isRecordingRef.current = false;
		const mic = micRef.current;
		if (!mic) return;
		closeMic(mic);
		micRef.current = null;
	};

	// Unmounted (the dialog closed) while the mic was still being opened: release it once it is
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			releaseMic();
		};
	}, []);

	// One mic at a time: a second tap while the first is still opening waits for it
	const acquiringRef = useRef<Promise<OpenMic> | null>(null);
	const acquireMic = () => {
		if (micRef.current) return Promise.resolve(micRef.current);
		if (!acquiringRef.current)
			acquiringRef.current = openMic().finally(() => {
				acquiringRef.current = null;
			});
		return acquiringRef.current;
	};

	const openMic = async () => {
		const stream = await navigator.mediaDevices.getUserMedia({
			// A voice message, not a call: echo cancellation has nothing to cancel and its processing
			// adds warbly artifacts on Android WebViews; noise suppression and gain control still help
			audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
		});
		const mic = await openCapture(stream, (chunk) => {
			let sum = 0;
			for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
			levelRef.current = Math.min(1, Math.sqrt(sum / chunk.length) * 5);

			if (isRecordingRef.current) {
				samplesRef.current.push(chunk);
			} else {
				preBufferRef.current.push(chunk);
				if (preBufferRef.current.length > PRE_BUFFER_CHUNKS) preBufferRef.current.shift();
			}
		});
		if (!mountedRef.current) {
			closeMic(mic);
			throw new Error('Closed while opening the microphone');
		}
		micRef.current = mic;
		return mic;
	};

	const finalize = async () => {
		if (frameRef.current) cancelAnimationFrame(frameRef.current);
		frameRef.current = null;
		isRecordingRef.current = false;

		const sampleRate = micRef.current?.context.sampleRate ?? 48000;
		const chunks = samplesRef.current;
		samplesRef.current = [];
		// The mic closes as recording stops (its indicator off), not when the dialog closes; the
		// next recording opens it again
		releaseMic();
		preBufferRef.current = [];
		const merged = mergeChunks(chunks);

		if (merged.length / sampleRate < MIN_RECORD_SECONDS) {
			setError(`Recording too short (minimum ${MIN_RECORD_SECONDS}s)`);
			setState('idle');
			return;
		}

		const samples = await resample(merged, sampleRate, TARGET_SAMPLE_RATE, downsampleBuffer);
		setRecording({
			samples,
			sampleRate: TARGET_SAMPLE_RATE,
			previewUri: encodeWavDataUri(samples, TARGET_SAMPLE_RATE),
			duration: samples.length / TARGET_SAMPLE_RATE,
			peaks: computeWaveformPeaks(samples, WAVEFORM_BAR_COUNT),
		});
		setState('review');
	};

	const start = async () => {
		if (isRecordingRef.current) return;
		setError(null);
		try {
			const mic = await acquireMic();
			if (mic.context.state === 'suspended') await mic.context.resume();
		} catch (err) {
			if (!mountedRef.current) return;
			const name = (err as DOMException)?.name;
			setError(
				name === 'NotAllowedError' || name === 'PermissionDeniedError'
					? 'Microphone permission required in browser settings'
					: `Couldn't use the mic: ${(err as Error)?.message || 'no access'}`,
			);
			return;
		}
		// Closed while the mic was waking: it's released already, so don't start recording
		if (!mountedRef.current || !micRef.current) return;

		samplesRef.current = [...preBufferRef.current];
		preBufferRef.current = [];
		isRecordingRef.current = true;
		startTimeRef.current = Date.now();
		setElapsed(0);
		setState('recording');

		const tick = () => {
			const secs = (Date.now() - startTimeRef.current) / 1000;
			setElapsed(Math.min(secs, maxSeconds));
			setLevel(levelRef.current);
			if (secs >= maxSeconds) {
				finalize();
				return;
			}
			frameRef.current = requestAnimationFrame(tick);
		};
		frameRef.current = requestAnimationFrame(tick);
	};

	const stop = () => {
		if (isRecordingRef.current) finalize();
	};

	const discard = () => {
		setRecording(null);
		setError(null);
		setState('idle');
	};

	return { state, setState, error, setError, recording, elapsed, level, start, stop, discard };
}

// The middle of the composer: the text box, or in its place the recording's box with the same look
const FIELD =
	'flex h-12 min-w-0 flex-1 items-center gap-2 rounded-md border border-input px-2 shadow-xs dark:bg-input/30';

/** Plays back the recording on a scrubbable waveform, in the text box's place. */
const WaveformPlayer: React.FC<{ recording: Recording }> = ({ recording }) => {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);

	useEffect(() => {
		const audio = new Audio(recording.previewUri);
		audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
		audio.onended = () => {
			setIsPlaying(false);
			setCurrentTime(0);
		};
		audioRef.current = audio;
		return () => {
			audio.pause();
			audioRef.current = null;
		};
	}, [recording.previewUri]);

	const play = () => {
		audioRef.current?.play().catch((err) => {
			console.warn('Preview play error:', err);
			setIsPlaying(false);
		});
		setIsPlaying(true);
	};

	const togglePlayback = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (isPlaying) {
			audio.pause();
			setIsPlaying(false);
		} else {
			if (audio.currentTime >= recording.duration - 0.1) audio.currentTime = 0;
			play();
		}
	};

	const seek = (e: React.MouseEvent<HTMLButtonElement>) => {
		const audio = audioRef.current;
		if (!audio) return;
		const rect = e.currentTarget.getBoundingClientRect();
		audio.currentTime = (Math.max(0, Math.min(rect.width, e.clientX - rect.left)) / rect.width) * recording.duration;
		setCurrentTime(audio.currentTime);
		if (!isPlaying) play();
	};

	const playedBars = Math.floor((currentTime / recording.duration) * recording.peaks.length);

	return (
		<div className={FIELD}>
			<Button
				variant="ghost"
				size="icon"
				onClick={togglePlayback}
				aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
			>
				{isPlaying ? <Pause /> : <Play />}
			</Button>
			<button
				type="button"
				onClick={seek}
				aria-label="Seek recording"
				className="flex h-8 min-w-0 flex-1 items-center gap-0.5"
			>
				{recording.peaks.map((peak, i) => (
					<span
						key={i}
						className={cn('flex-1 rounded-full', i < playedBars ? 'bg-primary' : 'bg-muted-foreground/30')}
						style={{ height: `${Math.round(peak * 100)}%` }}
					/>
				))}
			</button>
			<span className="pr-1 font-mono text-muted-foreground text-sm tabular-nums">
				{formatDuration(currentTime)} / {formatDuration(recording.duration)}
			</span>
		</div>
	);
};

/** {@link MessageComposer}'s props. */
export interface MessageComposerProps {
	/** The typed message (kept by the caller, so a sent or picked message can clear it). */
	text: string;
	/** Called as the message is typed. */
	onTextChange: (text: string) => void;
	/** Send the typed message (Enter or the send button); the caller clears the box at once, and queues it. */
	onSendText: (text: string) => void;
	/** The text box's placeholder. */
	placeholder: string;
	/** The text box's accessible name. */
	inputLabel: string;
	/** The send button's label: "Announce", "Speak". */
	sendLabel: string;
	/** Deliver the recording; throw an Error to show its message and return to review. */
	onSendRecording: (recording: Recording) => Promise<void>;
	/** Destination shown while sending, e.g. "camera speaker" or "3 speakers". */
	targetLabel: string;
	/** Reason sending is blocked (e.g. no speakers selected); disables both sends. */
	sendBlockedReason?: string;
	/** The caller's last result ("Announcement sent to 2 speakers"), on the line under the row. */
	status?: { text: string; isError?: boolean } | null;
	/** The longest a recording may run before it stops itself, in seconds. */
	maxSeconds?: number;
}

/**
 * Type or record a message in one row: the mic on the left, the text box and send on the right.
 * Tap the mic (or hold it: letting go stops) to record; the live level, then the recording's
 * waveform with playback, take the text box's place until it's sent or discarded, the mic giving
 * way to Stop and then Discard. The typed text is kept meanwhile.
 */
export const MessageComposer: React.FC<MessageComposerProps> = ({
	text,
	onTextChange,
	onSendText,
	placeholder,
	inputLabel,
	sendLabel,
	onSendRecording,
	targetLabel,
	sendBlockedReason,
	status,
	maxSeconds = 30,
}) => {
	const { state, setState, error, setError, recording, elapsed, level, start, stop, discard } =
		useVoiceRecorder(maxSeconds);

	// Reset the "sent" confirmation back to the text box
	useEffect(() => {
		if (state !== 'sent') return;
		const timer = setTimeout(discard, 1800);
		return () => clearTimeout(timer);
	}, [state]);

	const sendRecording = async () => {
		if (!recording) return;
		setState('sending');
		try {
			await onSendRecording(recording);
			setState('sent');
		} catch (err) {
			console.error('Failed to send voice message:', err);
			setError((err as Error)?.message || `Couldn't play it on ${targetLabel}`);
			setState('review');
		}
	};

	// Tap to start, or press and hold: releasing after HOLD_TO_TALK_MS stops the recording.
	// The release is caught on window because this button unmounts once recording starts.
	const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
		e.preventDefault();
		const pressStart = Date.now();
		const onRelease = () => {
			window.removeEventListener('pointerup', onRelease);
			window.removeEventListener('pointercancel', onRelease);
			if (Date.now() - pressStart > HOLD_TO_TALK_MS) stop();
		};
		window.addEventListener('pointerup', onRelease);
		window.addEventListener('pointercancel', onRelease);
		start();
	};

	const typed = text.trim();
	const isText = state === 'idle';

	const line = error ?? (state === 'review' ? sendBlockedReason : undefined) ?? status?.text;
	return (
		<div className="flex flex-col gap-1.5">
			<form
				className="flex items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					if (state === 'review') sendRecording();
					else if (isText && typed && !sendBlockedReason) onSendText(typed);
				}}
			>
				{state === 'idle' && (
					<Button
						type="button"
						variant="outline"
						size="icon-xl"
						onPointerDown={onPointerDown}
						// A pointer press already started it; a keyboard one (detail 0) starts here
						onClick={(e) => e.detail === 0 && start()}
						onContextMenu={(e) => e.preventDefault()}
						aria-label="Record a voice message"
						title={`Tap or hold to record (up to ${maxSeconds}s)`}
					>
						<Mic className="size-5" />
					</Button>
				)}
				{state === 'recording' && (
					<Button type="button" variant="destructive" size="icon-xl" onClick={stop} aria-label="Stop recording">
						<Square className="size-5" />
					</Button>
				)}
				{(state === 'review' || state === 'sending' || state === 'sent') && (
					<Button
						type="button"
						variant="outline"
						size="icon-xl"
						onClick={discard}
						disabled={state !== 'review'}
						aria-label="Discard recording"
					>
						<Trash2 className="size-5" />
					</Button>
				)}

				{state === 'idle' && (
					<Input
						value={text}
						onInput={(e) => onTextChange((e.target as HTMLInputElement).value)}
						placeholder={placeholder}
						aria-label={inputLabel}
						// The keyboard resizes the panel after focus; bring the box back into view once it has
						onFocus={(e) => {
							const input = e.currentTarget;
							setTimeout(() => input.scrollIntoView({ block: 'nearest' }), 350);
						}}
						className="h-12 flex-1 text-base md:text-base"
					/>
				)}
				{state === 'recording' && (
					<div className={FIELD}>
						<span className="ml-1 size-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
						<div className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden">
							{Array.from({ length: LIVE_BAR_COUNT }, (_, i) => {
								// Ripple the live level across the bars so speech reads as motion
								const wave = Math.sin(Date.now() / 120 + i * 0.45) * 0.35 + 0.65;
								return (
									<span
										key={i}
										className="w-1 shrink-0 rounded-full bg-primary"
										style={{ height: `${Math.max(4, Math.min(32, Math.round(level * wave * 32)))}px` }}
									/>
								);
							})}
						</div>
						<span className="pr-1 font-mono text-muted-foreground text-sm tabular-nums">
							{formatDuration(elapsed)} / {formatDuration(maxSeconds)}
						</span>
					</div>
				)}
				{state === 'review' && recording && <WaveformPlayer recording={recording} />}
				{state === 'sending' && (
					<div className={cn(FIELD, 'px-3 text-muted-foreground text-sm')}>
						<Loader2 className="size-4 shrink-0 animate-spin" />
						<span className="truncate">Sending to {targetLabel}…</span>
					</div>
				)}
				{state === 'sent' && recording && (
					<div className={cn(FIELD, 'px-3 text-sm')}>
						<Check className="size-4 shrink-0" />
						<span className="truncate">Voice message sent ({recording.duration.toFixed(1)}s)</span>
					</div>
				)}

				<Button
					type="submit"
					size="xl"
					loading={state === 'sending'}
					disabled={!!sendBlockedReason || (isText ? !typed : state !== 'review' && state !== 'sending')}
					title={sendBlockedReason}
				>
					<Send />
					{sendLabel}
				</Button>
			</form>

			{/* Only while there's something to say: an empty line left a band under the row, which sits at
			    its dialog's bottom edge (the camera's talkback, the intercom), so what it sits under gives way */}
			{line && (
				<p
					role="status"
					className={cn('truncate text-sm', error || status?.isError ? 'text-destructive' : 'text-muted-foreground')}
				>
					{line}
				</p>
			)}
		</div>
	);
};
