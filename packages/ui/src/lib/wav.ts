/** Average-downsample mono PCM to a lower sample rate. */
export function downsampleBuffer(buffer: Float32Array, sampleRate: number, outSampleRate: number): Float32Array {
	if (outSampleRate >= sampleRate) return buffer;
	const ratio = sampleRate / outSampleRate;
	const result = new Float32Array(Math.round(buffer.length / ratio));
	let offsetBuffer = 0;
	for (let i = 0; i < result.length; i++) {
		const nextOffsetBuffer = Math.round((i + 1) * ratio);
		let accum = 0;
		let count = 0;
		for (let j = offsetBuffer; j < nextOffsetBuffer && j < buffer.length; j++) {
			accum += buffer[j];
			count++;
		}
		result[i] = count > 0 ? accum / count : 0;
		offsetBuffer = nextOffsetBuffer;
	}
	return result;
}

/** Concatenate captured Float32 chunks into one buffer. */
export function mergeChunks(chunks: Float32Array[]): Float32Array {
	const merged = new Float32Array(chunks.reduce((sum, c) => sum + c.length, 0));
	let offset = 0;
	for (const c of chunks) {
		merged.set(c, offset);
		offset += c.length;
	}
	return merged;
}

/**
 * Encode mono samples as 16-bit PCM WAV. Optional head/tail silence gives speakers
 * (UniFi Protect, Sonos) time to un-mute their DAC so the first word isn't clipped.
 */
export function encodeWav(
	samples: Float32Array,
	sampleRate: number,
	headSilenceSec = 0,
	tailSilenceSec = 0,
): ArrayBuffer {
	const headCount = Math.round(sampleRate * headSilenceSec);
	const tailCount = Math.round(sampleRate * tailSilenceSec);
	const totalCount = headCount + samples.length + tailCount;

	const buffer = new ArrayBuffer(44 + totalCount * 2);
	const view = new DataView(buffer);
	const writeString = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
	};

	writeString(0, 'RIFF');
	view.setUint32(4, 36 + totalCount * 2, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // Mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeString(36, 'data');
	view.setUint32(40, totalCount * 2, true);

	// Head silence is the zero-initialized region before the samples
	let offset = 44 + headCount * 2;
	for (let i = 0; i < samples.length; i++, offset += 2) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
	}

	return buffer;
}

/** Same as {@link encodeWav}, as a base64 `data:audio/wav` URI. */
export function encodeWavDataUri(
	samples: Float32Array,
	sampleRate: number,
	headSilenceSec = 0,
	tailSilenceSec = 0,
): string {
	const bytes = new Uint8Array(encodeWav(samples, sampleRate, headSilenceSec, tailSilenceSec));
	let binary = '';
	for (let i = 0; i < bytes.length; i += 8192) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
	}
	return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Normalized (0.12–1) average-amplitude peaks for drawing a waveform. */
export function computeWaveformPeaks(samples: Float32Array, numBars = 44): number[] {
	if (samples.length === 0) return new Array(numBars).fill(0.2);
	const blockSize = Math.floor(samples.length / numBars);
	const peaks: number[] = [];
	for (let i = 0; i < numBars; i++) {
		const start = i * blockSize;
		const count = Math.min(blockSize, samples.length - start);
		let sum = 0;
		for (let j = 0; j < count; j++) sum += Math.abs(samples[start + j]);
		peaks.push(count > 0 ? sum / count : 0);
	}
	const max = Math.max(...peaks, 0.005);
	return peaks.map((p) => Math.max(0.12, Math.min(1, p / max)));
}

/** Format seconds as m:ss. */
export function formatDuration(sec: number): string {
	const s = Math.max(0, Math.round(sec || 0));
	return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
