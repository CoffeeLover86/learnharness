/// <reference lib="webworker" />
/*
 * Local Whisper dictation — the speech model runs in this worker so
 * transcription never blocks the page. transformers.js downloads the ONNX
 * model from Hugging Face once and keeps it in the browser cache; audio
 * itself never leaves the machine.
 *
 * WebGPU first (fast), WASM as the fallback (works everywhere, slower).
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { WhisperRequest, WhisperResponse } from "./whisper-protocol";

env.allowLocalModels = false;

const REPOS: Record<string, string> = {
	"whisper-base": "onnx-community/whisper-base",
	"whisper-small": "onnx-community/whisper-small",
};

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: WhisperResponse) => scope.postMessage(message);

let loaded: { engine: string; pipe: Promise<AutomaticSpeechRecognitionPipeline> } | null = null;

async function hasWebGPU(): Promise<boolean> {
	const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
	if (!gpu) return false;
	try { return (await gpu.requestAdapter()) != null; } catch { return false; }
}

function create(engine: string): Promise<AutomaticSpeechRecognitionPipeline> {
	const repo = REPOS[engine];
	if (!repo) return Promise.reject(new Error(`Unknown Whisper engine: ${engine}`));
	// Per-file byte counts → one overall download percentage.
	const files = new Map<string, { loaded: number; total: number }>();
	const progress_callback = (event: { status: string; file?: string; loaded?: number; total?: number }) => {
		if (event.status !== "progress" || !event.file || !event.total) return;
		files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
		let done = 0, total = 0;
		for (const f of files.values()) { done += f.loaded; total += f.total; }
		post({ type: "progress", engine, percent: total ? Math.round((done / total) * 100) : 0 });
	};
	const build = async () => {
		if (await hasWebGPU()) {
			try {
				return await pipeline("automatic-speech-recognition", repo, {
					device: "webgpu",
					dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
					progress_callback,
				});
			} catch {
				// Driver or adapter trouble: the WASM path below still works.
			}
		}
		return pipeline("automatic-speech-recognition", repo, { device: "wasm", dtype: "q8", progress_callback });
	};
	return build().then((pipe) => {
		post({ type: "ready", engine });
		return pipe as AutomaticSpeechRecognitionPipeline;
	});
}

function load(engine: string): Promise<AutomaticSpeechRecognitionPipeline> {
	if (loaded?.engine === engine) return loaded.pipe;
	if (loaded) void loaded.pipe.then((pipe) => pipe.dispose()).catch(() => {});
	const pipe = create(engine);
	loaded = { engine, pipe };
	// A failed load must not poison the next attempt.
	pipe.catch(() => { if (loaded?.pipe === pipe) loaded = null; });
	return pipe;
}

scope.onmessage = async (event: MessageEvent<WhisperRequest>) => {
	const message = event.data;
	if (message.type === "load") {
		load(message.engine).catch((error: unknown) => {
			post({ type: "load-error", engine: message.engine, message: error instanceof Error ? error.message : String(error) });
		});
		return;
	}
	try {
		const asr = await load(message.engine);
		const output = await asr(message.audio, {
			...(message.language ? { language: message.language } : {}),
			task: "transcribe",
			chunk_length_s: 30,
			stride_length_s: 5,
		});
		const text = Array.isArray(output) ? output.map((o) => o.text).join(" ") : output.text;
		post({ type: "result", id: message.id, text });
	} catch (error) {
		post({ type: "error", id: message.id, message: error instanceof Error ? error.message : String(error) });
	}
};
