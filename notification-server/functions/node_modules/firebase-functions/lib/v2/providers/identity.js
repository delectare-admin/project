const require_rolldown_runtime = require('../../_virtual/rolldown_runtime.js');
const require_common_options = require('../../common/options.js');
const require_runtime_manifest = require('../../runtime/manifest.js');
const require_common_onInit = require('../../common/onInit.js');
const require_common_providers_https = require('../../common/providers/https.js');
const require_common_providers_identity = require('../../common/providers/identity.js');
const require_v2_trace = require('../trace.js');
const require_v2_compat = require('../compat.js');
const require_v2_options = require('../options.js');

//#region src/v2/providers/identity.ts
var identity_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	HttpsError: () => require_common_providers_https.HttpsError,
	IS_NOT_TENANT: () => IS_NOT_TENANT,
	beforeEmailSent: () => beforeEmailSent,
	beforeOperation: () => beforeOperation,
	beforeSmsSent: () => beforeSmsSent,
	beforeUserCreated: () => beforeUserCreated,
	beforeUserSignedIn: () => beforeUserSignedIn,
	getOpts: () => getOpts,
	getV1AuthContext: () => getV1AuthContext,
	onUserCreated: () => onUserCreated,
	onUserDeleted: () => onUserDeleted
});
/**
* Handles an event that is triggered before a user is created.
* @param optsOrHandler - Either an object containing function options, or an event handler (run before user creation).
* @param handler? - If defined, an event handler which is run every time before a user is created.
*/
function beforeUserCreated(optsOrHandler, handler) {
	return beforeOperation("beforeCreate", optsOrHandler, handler);
}
/**
* Handles an event that is triggered before a user is signed in.
* @param optsOrHandler - Either an object containing function options, or an event handler (run before user signin).
* @param handler - Event handler which is run every time before a user is signed in.
*/
function beforeUserSignedIn(optsOrHandler, handler) {
	return beforeOperation("beforeSignIn", optsOrHandler, handler);
}
/**
* Handles an event that is triggered before an email is sent to a user.
* @param optsOrHandler - Either an object containing function options, or an event handler that is run before an email is sent to a user.
* @param handler - Event handler that is run before an email is sent to a user.
*/
function beforeEmailSent(optsOrHandler, handler) {
	return beforeOperation("beforeSendEmail", optsOrHandler, handler);
}
/**
* Handles an event that is triggered before an SMS is sent to a user.
* @param optsOrHandler - Either an object containing function options, or an event handler that is run before an SMS is sent to a user.
* @param handler - Event handler that is run before an SMS is sent to a user.
*/
function beforeSmsSent(optsOrHandler, handler) {
	return beforeOperation("beforeSendSms", optsOrHandler, handler);
}
/** @hidden */
function beforeOperation(eventType, optsOrHandler, handler) {
	if (!handler || typeof optsOrHandler === "function") {
		handler = optsOrHandler;
		optsOrHandler = {};
	}
	const { opts,...blockingOptions } = getOpts(optsOrHandler);
	const annotatedHandler = Object.assign(handler, { platform: "gcfv2" });
	const func = require_v2_trace.wrapTraceContext(require_common_onInit.withInit(require_common_providers_identity.wrapHandler(eventType, annotatedHandler)));
	const legacyEventType = `providers/cloud.auth/eventTypes/user.${eventType}`;
	/** Endpoint */
	const baseOptsEndpoint = require_v2_options.optionsToEndpoint(require_v2_options.getGlobalOptions());
	const specificOptsEndpoint = require_v2_options.optionsToEndpoint(opts, "identity");
	func.__endpoint = {
		...require_runtime_manifest.initV2Endpoint(require_v2_options.getGlobalOptions(), opts),
		platform: "gcfv2",
		...baseOptsEndpoint,
		...specificOptsEndpoint,
		labels: {
			...baseOptsEndpoint?.labels,
			...specificOptsEndpoint?.labels
		},
		blockingTrigger: {
			eventType: legacyEventType,
			options: { ...(eventType === "beforeCreate" || eventType === "beforeSignIn") && blockingOptions }
		}
	};
	func.__requiredAPIs = [{
		api: "identitytoolkit.googleapis.com",
		reason: "Needed for auth blocking functions"
	}];
	func.run = handler;
	return func;
}
/** @hidden */
function getOpts(blockingOptions) {
	const accessToken = blockingOptions.accessToken || false;
	const idToken = blockingOptions.idToken || false;
	const refreshToken = blockingOptions.refreshToken || false;
	const opts = { ...blockingOptions };
	delete opts.accessToken;
	delete opts.idToken;
	delete opts.refreshToken;
	return {
		opts,
		accessToken,
		idToken,
		refreshToken
	};
}
/**
* Constant to represent the absence of a tenant ID.
* @beta
*/
const IS_NOT_TENANT = require_common_options.RESET_VALUE;
function getOptsAndHandler(optsOrHandler, handler) {
	if (typeof optsOrHandler === "function") {
		return {
			opts: {},
			handler: optsOrHandler
		};
	}
	return {
		opts: optsOrHandler,
		handler
	};
}
const PROJECT_ID_REGEX = /(?:^|\/)projects\/([^\/]+)/;
const IDENTITY_TOOLKIT_SOURCE_PREFIX = "//identitytoolkit.googleapis.com/";
const FIREBASE_AUTH_SERVICE = "firebaseauth.googleapis.com";
const USER_CREATED_EVENT = "google.firebase.auth.user.v2.created";
const USER_DELETED_EVENT = "google.firebase.auth.user.v2.deleted";
/**
* Converts the v2 Eventarc (`AuthEventData`) protobuf wire protocol (`value`/`oldValue`, `createTime`, `photoUrl`)
* into the v1 `LegacyEvent` wire protocol expected by `userRecordConstructor`.
* @hidden
*/
function convertV2EventToV1Event(rawData) {
	if (!rawData || typeof rawData !== "object") {
		return undefined;
	}
	const dataObj = rawData;
	let rawUser;
	if ("value" in dataObj) {
		rawUser = dataObj.value;
	} else if ("oldValue" in dataObj) {
		rawUser = dataObj.oldValue;
	} else if ("old_value" in dataObj) {
		rawUser = dataObj.old_value;
	} else {
		rawUser = dataObj;
	}
	if (!rawUser || typeof rawUser !== "object") {
		return undefined;
	}
	const userData = { ...rawUser };
	if (userData.photoUrl && !userData.photoURL) {
		userData.photoURL = userData.photoUrl;
	}
	if (userData.metadata && typeof userData.metadata === "object") {
		const meta = { ...userData.metadata };
		if (meta.createTime && !meta.createdAt && !meta.creationTime) {
			meta.creationTime = meta.createTime;
		}
		userData.metadata = meta;
	}
	return require_common_providers_identity.userRecordConstructor(userData);
}
/**
* Normalizes raw CloudEvents from Eventarc into AuthEvent<User>.
* Eventarc wraps v2 Authentication user payloads inside an `AuthEventData`
* protobuf envelope (`value` for creation events, `oldValue` for deletion events).
* We unbox the envelope (falling back to `raw.data` for unit tests) and normalize
* protobuf-specific field names (`createTime` -> `creationTime`, `photoUrl` -> `photoURL`).
* @hidden
*/
function getAuthEvent(raw) {
	const event = { ...raw };
	if (raw.data !== undefined && raw.data !== null) {
		event.data = convertV2EventToV1Event(raw.data);
	}
	const rawShape = raw;
	const tenantId = rawShape.tenantid || rawShape.tenantId || event.data?.tenantId;
	if (tenantId) {
		event.tenantId = tenantId;
	}
	if (raw.source) {
		const match = raw.source.match(PROJECT_ID_REGEX);
		if (match) {
			event.project = match[1];
		}
	}
	return event;
}
/** @internal */
function getV1AuthContext(event) {
	let resourceName = event.source || "";
	if (resourceName.startsWith(IDENTITY_TOOLKIT_SOURCE_PREFIX)) {
		resourceName = resourceName.substring(IDENTITY_TOOLKIT_SOURCE_PREFIX.length);
	} else if (event.project) {
		resourceName = `projects/${event.project}`;
	}
	return {
		eventId: event.id,
		timestamp: event.time,
		eventType: event.type === USER_CREATED_EVENT ? "providers/firebase.auth/eventTypes/user.create" : event.type === USER_DELETED_EVENT ? "providers/firebase.auth/eventTypes/user.delete" : event.type,
		resource: {
			service: FIREBASE_AUTH_SERVICE,
			name: resourceName
		},
		params: {}
	};
}
/** @hidden */
function makeAuthTrigger(eventType, optsOrHandler, handler) {
	const { opts, handler: handlerFunc } = getOptsAndHandler(optsOrHandler, handler);
	if (typeof handlerFunc !== "function") {
		throw new Error("The handler must be a function.");
	}
	const wrappedHandler = require_v2_trace.wrapTraceContext(require_common_onInit.withInit(handlerFunc));
	const func = ((raw) => {
		const event = getAuthEvent(raw);
		if (opts.tenantId === IS_NOT_TENANT && event.tenantId) {
			return;
		}
		const compatEvent = require_v2_compat.addV1Compat(event, {
			context: () => getV1AuthContext(event),
			user: () => event.data
		});
		return wrappedHandler(compatEvent);
	});
	func.run = ((event) => {
		if (!event) {
			return handlerFunc(event);
		}
		const eventShape = event;
		const existingUser = eventShape.user;
		const tenantId = event.tenantId || eventShape.tenantid || existingUser?.tenantId || eventShape.data?.tenantId;
		if (opts.tenantId === IS_NOT_TENANT && tenantId) {
			return;
		}
		const existingContext = eventShape.context;
		const compatEvent = require_v2_compat.addV1Compat(event, {
			context: () => existingContext ?? getV1AuthContext(event),
			user: () => event.data ?? existingUser
		});
		return handlerFunc(compatEvent);
	});
	const baseOptsEndpoint = require_v2_options.optionsToEndpoint(require_v2_options.getGlobalOptions());
	const specificOptsEndpoint = require_v2_options.optionsToEndpoint(opts);
	const endpoint = {
		...require_runtime_manifest.initV2Endpoint(require_v2_options.getGlobalOptions(), opts),
		platform: "gcfv2",
		...baseOptsEndpoint,
		...specificOptsEndpoint,
		labels: {
			...baseOptsEndpoint?.labels,
			...specificOptsEndpoint?.labels
		},
		eventTrigger: {
			eventType,
			eventFilters: {},
			retry: opts.retry ?? false,
			region: "global"
		}
	};
	if (opts.tenantId !== undefined && opts.tenantId !== IS_NOT_TENANT) {
		endpoint.eventTrigger.eventFilters["tenantid"] = opts.tenantId;
	}
	func.__endpoint = endpoint;
	return func;
}
function onUserCreated(optsOrHandler, handler) {
	return makeAuthTrigger(USER_CREATED_EVENT, optsOrHandler, handler);
}
function onUserDeleted(optsOrHandler, handler) {
	return makeAuthTrigger(USER_DELETED_EVENT, optsOrHandler, handler);
}

//#endregion
exports.HttpsError = require_common_providers_https.HttpsError;
exports.IS_NOT_TENANT = IS_NOT_TENANT;
exports.beforeEmailSent = beforeEmailSent;
exports.beforeOperation = beforeOperation;
exports.beforeSmsSent = beforeSmsSent;
exports.beforeUserCreated = beforeUserCreated;
exports.beforeUserSignedIn = beforeUserSignedIn;
exports.getOpts = getOpts;
exports.getV1AuthContext = getV1AuthContext;
Object.defineProperty(exports, 'identity_exports', {
  enumerable: true,
  get: function () {
    return identity_exports;
  }
});
exports.onUserCreated = onUserCreated;
exports.onUserDeleted = onUserDeleted;