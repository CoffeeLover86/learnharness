import { claudeCodeInstallationResponse } from "@/src/server";

/** Installation/version, plus (fork) the CLI's signed-in boolean; never a model request. */
export async function GET(request: Request) {
	return claudeCodeInstallationResponse(request);
}
