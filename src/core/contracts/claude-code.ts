export const CLAUDE_CODE_PROVIDER = "claude-code";

/** Installation/version only. Never an authentication, quota, or billing verdict. */
export interface ClaudeCodeStatus {
	state: "not-found" | "meets-minimum" | "update-required" | "version-unchecked";
	version: string | null;
	minimumVersion: string;
	/** Fork: the CLI's own `auth status` verdict — true/false, or null when it
	 * could not be read. Only this boolean leaves the server, never account
	 * details. Absent from upstream responses. */
	signedIn?: boolean | null;
}

// --permission-prompts none was added in 2.1.259. This is not an official
// minimum-version/stability contract for claudecode/toolUseId; admission fails closed.
export const CLAUDE_CODE_MINIMUM_VERSION = "2.1.259";
