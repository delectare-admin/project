import { globalManifest } from "../runtime/manifest.mjs";

//#region src/common/api.ts
/**
* Declare that this project requires a specific Google Cloud API to be enabled.
* @param api The API name, e.g. "secretmanager.googleapis.com"
* @param reason Optional reason why the API is needed.
*/
function requiresAPI(api, reason = "") {
	if (!api || typeof api !== "string" || !api.endsWith(".googleapis.com")) {
		throw new Error("requiresAPI: 'api' must be a non-empty string ending with '.googleapis.com'.");
	}
	if (!Array.isArray(globalManifest.requiredAPIs)) {
		globalManifest.requiredAPIs = [];
	}
	const list = globalManifest.requiredAPIs;
	const existing = list.find((item) => item.api === api);
	if (existing) {
		if (reason && !existing.reason.includes(reason)) {
			existing.reason = existing.reason ? `${existing.reason} ${reason}` : reason;
		}
	} else {
		list.push({
			api,
			reason
		});
	}
}
/**
* @internal
*/
function getGlobalRequiredAPIs() {
	if (!Array.isArray(globalManifest.requiredAPIs)) {
		return [];
	}
	return globalManifest.requiredAPIs;
}
/**
* @internal
*/
function clearGlobalRequiredAPIs() {
	delete globalManifest.requiredAPIs;
}

//#endregion
export { clearGlobalRequiredAPIs, getGlobalRequiredAPIs, requiresAPI };