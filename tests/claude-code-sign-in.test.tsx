/**
 * Fork: Claude Code sign-in status in Settings. The server reads the CLI's
 * `auth status` JSON and keeps only the `loggedIn` boolean.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";

import { inspectClaudeSignIn } from "../src/agent/claude-code/installation.ts";
import { ClaudeCodeError } from "../src/agent/claude-code/constants.ts";
import { claudeCodeStatusLabel } from "../components/settings/claude-code-status.tsx";

const SIGNED_OUT = JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" });
const SIGNED_IN = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "someone@example.com" });

test("inspectClaudeSignIn returns only the loggedIn boolean", async () => {
	assert.equal(await inspectClaudeSignIn(() => "claude.exe", async () => SIGNED_IN), true);
	assert.equal(await inspectClaudeSignIn(() => "claude.exe", async () => SIGNED_OUT), false);
});

test("inspectClaudeSignIn is null when the CLI is missing or its output is unreadable", async () => {
	assert.equal(await inspectClaudeSignIn(() => null, async () => SIGNED_IN), null);
	assert.equal(await inspectClaudeSignIn(() => "claude.exe", async () => "not json"), null);
	assert.equal(await inspectClaudeSignIn(() => "claude.exe", async () => JSON.stringify({ loggedIn: "yes" })), null);
	assert.equal(await inspectClaudeSignIn(() => "claude.exe", async () => { throw new Error("timeout"); }), null);
});

test("the Settings label adds the sign-in verdict only when it is known", () => {
	const base = { state: "meets-minimum" as const, version: "2.1.319", minimumVersion: "2.1.259" };
	assert.equal(claudeCodeStatusLabel({ ...base, signedIn: true }), "Version 2.1.319 · meets minimum · signed in");
	assert.equal(claudeCodeStatusLabel({ ...base, signedIn: false }), "Version 2.1.319 · not signed in");
	assert.equal(claudeCodeStatusLabel({ ...base, signedIn: null }), "Version 2.1.319 · meets minimum");
	assert.equal(claudeCodeStatusLabel(base), "Version 2.1.319 · meets minimum");
});

test("the signed-out lesson error says how to sign in, including the PowerShell form", () => {
	assert.match(ClaudeCodeError.NotSignedIn, /claude auth login/);
	assert.match(ClaudeCodeError.NotSignedIn, /claude\.cmd auth login/);
});
