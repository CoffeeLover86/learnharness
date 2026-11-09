"use client";

import type { WhisperRequest, WhisperResponse } from "@/components/whisper-protocol";

/*
 * One app-lifetime worker holds the loaded model, so only the first run
 * pays the download and model start-up. Requests carry ids; progress is
 * broadcast to whoever is listening.
 */
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
const progressListeners = new Set<(percent: number) => void>();

function getWorker(): Worker {
	if (worker) return worker;
	const created = new Worker(new URL("./whisper-worker.ts", import.meta.url), { type: "module" });
	created.onmessage = (event: MessageEvent<WhisperResponse>) => {
		const message = event.data;
		if (message.type === "progress") {
			for (const listener of progressListeners) listener(message.percent);
		} else if (message.type === "result" || message.type === "error") {
			const request = pending.get(message.id);
			if (!request) return;
			pending.delete(message.id);
			if (message.type === "result") request.resolve(message.text);
			else request.reject(new Error(message.message));
		}
	};
	created.onerror = (event) => {
		// A crashed worker fails every request in flight; the next call starts a new one.
		const error = new Error(event.message || "Whisper worker crashed");
		for (const request of pending.values()) request.reject(error);
		pending.clear();
		created.terminate();
		if (worker === created) worker = null;
	};
	worker = created;
	return created;
}

function send(message: WhisperRequest, transfer: Transferable[] = []) {
	getWorker().postMessage(message, transfer);
}

/** Start downloading/loading the model in the background (recording start). */
export function preloadWhisper(engine: string): void {
	send({ type: "load", engine });
}

/** Model download progress (0–100) while it is being fetched. */
export function onWhisperProgress(listener: (percent: number) => void): () => void {
	progressListeners.add(listener);
	return () => { progressListeners.delete(listener); };
}

export function transcribeWithWhisper(engine: string, audio: Float32Array, language: string | null): Promise<string> {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		send({ type: "transcribe", id, engine, audio, language }, [audio.buffer]);
	});
}
