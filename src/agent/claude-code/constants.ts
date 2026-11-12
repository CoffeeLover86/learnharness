export { CLAUDE_CODE_PROVIDER } from "../../core/contracts/claude-code.ts";

export const CLAUDE_CODE_API = "claude-code-cli";

export enum ClaudeCodeError {
	CliNotFound = "claude CLI not found",
	// Fork: say how to fix it. PowerShell often blocks the plain `claude` shim.
	NotSignedIn = "Claude Code is not signed in. Run \"claude auth login\" in a terminal (in PowerShell: \"claude.cmd auth login\"), then click Retry.",
}
