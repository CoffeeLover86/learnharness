/** Messages between the page and the local Whisper worker. */
export type WhisperRequest =
	| { type: "load"; engine: string }
	| { type: "transcribe"; id: number; engine: string; audio: Float32Array; language: string | null };

export type WhisperResponse =
	| { type: "progress"; engine: string; percent: number }
	| { type: "ready"; engine: string }
	| { type: "load-error"; engine: string; message: string }
	| { type: "result"; id: number; text: string }
	| { type: "error"; id: number; message: string };

/** Whisper marks non-speech with bracketed tags ("[BLANK_AUDIO]",
 * "[Music]") or parenthesised ones ("(silence)"); none of it is dictation. */
export function cleanWhisperText(text: string): string {
	return text
		.replace(/\[[^\]]*\]/g, " ")
		.replace(/\((?:silence|music|noise|blank[_ ]audio)\)/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** linear16 frames (the capture worklet's format) → one Float32 signal,
 * plus the peak level so a silent run can skip the model entirely. */
export function pcmFramesToFloat32(frames: readonly Int16Array[]): { audio: Float32Array; peak: number } {
	let length = 0;
	for (const frame of frames) length += frame.length;
	const audio = new Float32Array(length);
	let offset = 0;
	let peak = 0;
	for (const frame of frames) {
		for (let i = 0; i < frame.length; i++) {
			const sample = frame[i]! / 0x8000;
			audio[offset++] = sample;
			const magnitude = sample < 0 ? -sample : sample;
			if (magnitude > peak) peak = magnitude;
		}
	}
	return { audio, peak };
}
