/**
 * Local Whisper dictation: the engine setting, language mapping, audio
 * conversion and output cleanup. The model itself is not run here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
	DICTATION_ENGINES, FACTORY_SETTINGS, isDictationEngine, isLocalDictationEngine, sanitizeUserSettings, whisperLanguage,
} from "../src/core/index.ts";
import { parseDictationSettingsBody } from "../src/server/settings-body.ts";
import { cleanWhisperText, pcmFramesToFloat32 } from "../components/whisper-protocol.ts";
import { createDictationLanguageStore } from "../components/dictation-preference.ts";

test("engines: deepgram stays the factory default; whisper engines are local", () => {
	assert.equal(FACTORY_SETTINGS.dictation.engine, "deepgram");
	assert.deepEqual(DICTATION_ENGINES.map((e) => e.code), ["deepgram", "whisper-base", "whisper-small"]);
	assert.equal(isLocalDictationEngine("deepgram"), false);
	assert.equal(isLocalDictationEngine("whisper-base"), true);
	assert.equal(isLocalDictationEngine("whisper-small"), true);
	for (const bad of ["whisper", "", null, 3]) assert.equal(isDictationEngine(bad), false);
});

test("whisperLanguage keeps the base language and auto-detects otherwise", () => {
	assert.equal(whisperLanguage("multi"), null);
	assert.equal(whisperLanguage("en"), "en");
	assert.equal(whisperLanguage("en-GB"), "en");
	assert.equal(whisperLanguage("de-CH"), "de");
	assert.equal(whisperLanguage("zh-Hant"), "zh");
	assert.equal(whisperLanguage("tl"), "tl");
});

test("settings keep language and engine independently", () => {
	assert.deepEqual(
		sanitizeUserSettings({ version: 1, dictation: { language: "de", engine: "whisper-small" } })?.dictation,
		{ language: "de", engine: "whisper-small" },
	);
	assert.deepEqual(sanitizeUserSettings({ version: 1, dictation: { language: "de", engine: "nope" } })?.dictation, { language: "de" });
	assert.deepEqual(sanitizeUserSettings({ version: 1, dictation: { engine: "whisper-base" } })?.dictation, { engine: "whisper-base" });
	assert.deepEqual(parseDictationSettingsBody({ language: "en", engine: "whisper-base" }), {
		ok: true, settings: { language: "en", engine: "whisper-base" },
	});
	assert.equal(parseDictationSettingsBody({ language: "en", engine: "whisper" }).ok, false);
});

test("saving the engine keeps the confirmed language in the replace-whole PUT", async () => {
	const puts: unknown[] = [];
	const store = createDictationLanguageStore(async (_url, init) => {
		if (init?.method === "PUT") {
			const body = JSON.parse(init.body as string);
			puts.push(body);
			return Response.json({ settings: { version: 1, dictation: body } });
		}
		return Response.json({ settings: { version: 1, dictation: { language: "de" } } });
	});
	assert.equal(await store.load(), "de");
	assert.equal(store.getSnapshot().engine, "deepgram");
	assert.equal(await store.saveEngine("whisper-small"), true);
	assert.deepEqual(puts.at(-1), { language: "de", engine: "whisper-small" });
	assert.deepEqual(await store.getPreference(), { language: "de", engine: "whisper-small" });
	assert.equal(await store.save("fr"), true);
	assert.deepEqual(puts.at(-1), { language: "fr", engine: "whisper-small" });
});

test("pcmFramesToFloat32 joins frames, scales to ±1 and reports the peak", () => {
	const { audio, peak } = pcmFramesToFloat32([new Int16Array([0, 16384]), new Int16Array([-32768])]);
	assert.deepEqual(Array.from(audio), [0, 0.5, -1]);
	assert.equal(peak, 1);
	assert.equal(pcmFramesToFloat32([]).audio.length, 0);
});

test("cleanWhisperText drops non-speech tags and tidies spacing", () => {
	assert.equal(cleanWhisperText(" [BLANK_AUDIO] "), "");
	assert.equal(cleanWhisperText(" Hello   world. [Music] (silence) Next."), "Hello world. Next.");
	assert.equal(cleanWhisperText("Keep (this) aside"), "Keep (this) aside");
});
