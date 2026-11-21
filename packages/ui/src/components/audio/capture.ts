// Microphone capture off the main thread. ScriptProcessorNode runs its callback on the main thread,
// so on a busy, low-power device (the ROAMiQ wall panels: HA state updates, the clock, cameras, the
// level meter) late callbacks drop or repeat blocks and the recording stutters. An AudioWorklet
// runs on the audio rendering thread instead; its chunks reach the page later when the page is busy,
// but none are lost.

/** Samples per chunk handed to the page (~43ms at 48kHz), the same size the ScriptProcessor used. */
export const CHUNK_SIZE = 2048;

const PROCESSOR_NAME = 'voice-capture';

// Loaded from a Blob URL: the dashboards ship as one inline bundle with no files to point at
const WORKLET_SOURCE = `
class VoiceCapture extends AudioWorkletProcessor {
	constructor() {
		super();
		this.buffer = new Float32Array(${CHUNK_SIZE});
		this.filled = 0;
	}
	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (channel) {
			let read = 0;
			while (read < channel.length) {
				const count = Math.min(channel.length - read, this.buffer.length - this.filled);
				this.buffer.set(channel.subarray(read, read + count), this.filled);
				this.filled += count;
				read += count;
				if (this.filled === this.buffer.length) {
					// Transfer the full chunk (no copy) and start a new one
					this.port.postMessage(this.buffer, [this.buffer.buffer]);
					this.buffer = new Float32Array(${CHUNK_SIZE});
					this.filled = 0;
				}
			}
		}
		return true;
	}
}
registerProcessor('${PROCESSOR_NAME}', VoiceCapture);
`;

/**
 * Feed `source`'s mono audio to `onChunk` in CHUNK_SIZE pieces: through an AudioWorklet when the
 * browser has one, else a ScriptProcessor. Returns the nodes to disconnect when done.
 */
export async function startCapture(
	context: AudioContext,
	source: MediaStreamAudioSourceNode,
	onChunk: (chunk: Float32Array) => void,
): Promise<AudioNode[]> {
	// Nodes only run when they lead to the destination: route through a muted gain so the mic
	// isn't played back through the speakers
	const silent = context.createGain();
	silent.gain.value = 0;
	silent.connect(context.destination);

	if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
		try {
			const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
			try {
				await context.audioWorklet.addModule(url);
			} finally {
				URL.revokeObjectURL(url);
			}
			const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
				numberOfInputs: 1,
				numberOfOutputs: 1,
				channelCount: 1,
				channelCountMode: 'explicit',
			});
			node.port.onmessage = (event: MessageEvent<Float32Array>) => onChunk(event.data);
			source.connect(node);
			node.connect(silent);
			return [source, node, silent];
		} catch (err) {
			console.warn('AudioWorklet capture unavailable, falling back to ScriptProcessor:', err);
		}
	}

	const processor = context.createScriptProcessor(CHUNK_SIZE, 1, 1);
	processor.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
	source.connect(processor);
	processor.connect(silent);
	return [source, processor, silent];
}

/**
 * Resample mono PCM with the browser's resampler (an OfflineAudioContext renders it with a proper
 * low-pass filter), falling back to `fallback` where Web Audio isn't available.
 */
export async function resample(
	samples: Float32Array,
	fromRate: number,
	toRate: number,
	fallback: (samples: Float32Array, fromRate: number, toRate: number) => Float32Array,
): Promise<Float32Array> {
	if (fromRate === toRate || samples.length === 0) return samples;
	const Offline =
		globalThis.OfflineAudioContext ??
		(globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
	if (!Offline) return fallback(samples, fromRate, toRate);
	try {
		const length = Math.max(1, Math.round((samples.length * toRate) / fromRate));
		const offline = new Offline(1, length, toRate);
		const buffer = offline.createBuffer(1, samples.length, fromRate);
		buffer.copyToChannel(samples, 0);
		const node = offline.createBufferSource();
		node.buffer = buffer;
		node.connect(offline.destination);
		node.start();
		const rendered = await offline.startRendering();
		return rendered.getChannelData(0).slice();
	} catch (err) {
		console.warn('Offline resampling failed, using the simple downsampler:', err);
		return fallback(samples, fromRate, toRate);
	}
}
