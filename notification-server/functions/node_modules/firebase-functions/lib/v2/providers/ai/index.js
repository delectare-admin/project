const require_rolldown_runtime = require('../../../_virtual/rolldown_runtime.js');
const require_logger_index = require('../../../logger/index.js');
const require_runtime_manifest = require('../../../runtime/manifest.js');
const require_common_onInit = require('../../../common/onInit.js');
const require_common_providers_https = require('../../../common/providers/https.js');
const require_v2_trace = require('../../trace.js');
const require_v2_options = require('../../options.js');
require('../https.js');
const require_v2_providers_ai_types_vertex_v1beta1_index = require('./types/vertex/v1beta1/index.js');
const require_v2_providers_ai_types_gemini_v1beta_index = require('./types/gemini/v1beta/index.js');

//#region src/v2/providers/ai/index.ts
var ai_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	HttpsError: () => require_common_providers_https.HttpsError,
	afterGenerateContent: () => afterGenerateContent,
	afterGenerateEventType: () => afterGenerateEventType,
	beforeGenerateContent: () => beforeGenerateContent,
	beforeGenerateEventType: () => beforeGenerateEventType,
	geminiV1Beta: () => geminiV1Beta,
	rpcCodeMap: () => rpcCodeMap,
	vertexV1Beta1: () => vertexV1Beta1
});
/**
* Mapping from `FunctionsErrorCode` strings to numeric RPC status codes.
*/
const rpcCodeMap = {
	ok: 0,
	cancelled: 1,
	unknown: 2,
	"invalid-argument": 3,
	"deadline-exceeded": 4,
	"not-found": 5,
	"already-exists": 6,
	"permission-denied": 7,
	unauthenticated: 16,
	"resource-exhausted": 8,
	"failed-precondition": 9,
	aborted: 10,
	"out-of-range": 11,
	unimplemented: 12,
	internal: 13,
	unavailable: 14,
	"data-loss": 15
};
/**
* Event type for `beforeGenerate` triggers.
*/
const beforeGenerateEventType = "google.firebase.ailogic.v1.beforeGenerate";
/**
* Event type for `afterGenerate` triggers.
*/
const afterGenerateEventType = "google.firebase.ailogic.v1.afterGenerate";
/**
* Identifier for the Gemini Developer API (`geminiV1Beta`).
*/
const geminiV1Beta = "google.ai.generativelanguage.v1beta";
/**
* Identifier for the Agent Platform Gemini API (formerly Vertex AI) (`vertexV1Beta1`).
*/
const vertexV1Beta1 = "google.cloud.aiplatform.v1beta1";
function beforeGenerateContent(optsOrCb, cb) {
	let opts;
	let handler;
	if (arguments.length === 1) {
		opts = {};
		handler = optsOrCb;
	} else {
		opts = optsOrCb;
		handler = cb;
	}
	let func = async (req, res) => {
		try {
			let event = req.body;
			if (Buffer.isBuffer(event)) {
				try {
					event = JSON.parse(event.toString("utf-8"));
				} catch (e) {
					require_logger_index.error("Invalid JSON body (Buffer):", e);
					throw new require_common_providers_https.HttpsError("invalid-argument", "Invalid JSON body", e);
				}
			} else if (typeof event === "string") {
				try {
					event = JSON.parse(event);
				} catch (e) {
					require_logger_index.error("Invalid JSON body (String):", e);
					throw new require_common_providers_https.HttpsError("invalid-argument", "Invalid JSON body", e);
				}
			}
			const parsedEvent = event;
			const result = await handler(parsedEvent);
			const responseBody = result || {};
			if (typeof responseBody === "object") {
				const api = parsedEvent.data?.api;
				if (api === geminiV1Beta) {
					responseBody["@type"] = require_v2_providers_ai_types_gemini_v1beta_index.requestTypeName;
				} else if (api === vertexV1Beta1) {
					responseBody["@type"] = require_v2_providers_ai_types_vertex_v1beta1_index.requestTypeName;
				}
			}
			res.status(200).send(responseBody);
		} catch (err) {
			require_logger_index.error("Unhandled error:", err);
			if (err instanceof require_common_providers_https.HttpsError) {
				res.status(500).send({
					code: rpcCodeMap[err.code] || 13,
					message: err.message
				});
			} else {
				res.status(500).send({
					code: 13,
					message: "Internal error."
				});
			}
		}
	};
	func.run = handler;
	func = require_v2_trace.wrapTraceContext(require_common_onInit.withInit(func));
	const baseOpts = require_v2_options.optionsToEndpoint(require_v2_options.getGlobalOptions());
	const specificOpts = require_v2_options.optionsToEndpoint(opts, "https");
	func.__endpoint = {
		...require_runtime_manifest.initV2Endpoint(require_v2_options.getGlobalOptions(), opts),
		platform: "gcfv2",
		...baseOpts,
		...specificOpts,
		labels: {
			...baseOpts?.labels,
			...specificOpts?.labels
		},
		blockingTrigger: { eventType: beforeGenerateEventType }
	};
	return func;
}
function afterGenerateContent(optsOrCb, cb) {
	let opts;
	let handler;
	if (arguments.length === 1) {
		opts = {};
		handler = optsOrCb;
	} else {
		opts = optsOrCb;
		handler = cb;
	}
	let func = async (req, res) => {
		try {
			let event = req.body;
			if (Buffer.isBuffer(event)) {
				try {
					event = JSON.parse(event.toString("utf-8"));
				} catch (e) {
					require_logger_index.error("Invalid JSON body (Buffer):", e);
					throw new require_common_providers_https.HttpsError("invalid-argument", "Invalid JSON body", e);
				}
			} else if (typeof event === "string") {
				try {
					event = JSON.parse(event);
				} catch (e) {
					require_logger_index.error("Invalid JSON body (String):", e);
					throw new require_common_providers_https.HttpsError("invalid-argument", "Invalid JSON body", e);
				}
			}
			const parsedEvent = event;
			const result = await handler(parsedEvent);
			const responseBody = result || {};
			if (typeof responseBody === "object") {
				const api = parsedEvent.data?.api;
				if (api === geminiV1Beta) {
					responseBody["@type"] = require_v2_providers_ai_types_gemini_v1beta_index.responseTypeName;
				} else if (api === vertexV1Beta1) {
					responseBody["@type"] = require_v2_providers_ai_types_vertex_v1beta1_index.responseTypeName;
				}
			}
			res.status(200).send(responseBody);
		} catch (err) {
			require_logger_index.error("Unhandled error:", err);
			if (err instanceof require_common_providers_https.HttpsError) {
				res.status(500).send({
					code: rpcCodeMap[err.code] || 13,
					message: err.message
				});
			} else {
				res.status(500).send({
					code: 13,
					message: "Internal error."
				});
			}
		}
	};
	func.run = handler;
	func = require_v2_trace.wrapTraceContext(require_common_onInit.withInit(func));
	const baseOpts = require_v2_options.optionsToEndpoint(require_v2_options.getGlobalOptions());
	const specificOpts = require_v2_options.optionsToEndpoint(opts, "https");
	func.__endpoint = {
		...require_runtime_manifest.initV2Endpoint(require_v2_options.getGlobalOptions(), opts),
		platform: "gcfv2",
		...baseOpts,
		...specificOpts,
		labels: {
			...baseOpts?.labels,
			...specificOpts?.labels
		},
		blockingTrigger: { eventType: afterGenerateEventType }
	};
	return func;
}

//#endregion
exports.HttpsError = require_common_providers_https.HttpsError;
exports.afterGenerateContent = afterGenerateContent;
exports.afterGenerateEventType = afterGenerateEventType;
Object.defineProperty(exports, 'ai_exports', {
  enumerable: true,
  get: function () {
    return ai_exports;
  }
});
exports.beforeGenerateContent = beforeGenerateContent;
exports.beforeGenerateEventType = beforeGenerateEventType;
exports.geminiV1Beta = geminiV1Beta;
exports.rpcCodeMap = rpcCodeMap;
exports.vertexV1Beta1 = vertexV1Beta1;