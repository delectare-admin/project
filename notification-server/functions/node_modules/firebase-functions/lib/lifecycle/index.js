const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_runtime_manifest = require('../runtime/manifest.js');

//#region src/lifecycle/index.ts
var lifecycle_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	afterFirstDeploy: () => afterFirstDeploy,
	afterRedeploy: () => afterRedeploy,
	clearDeclaredLifecycleHooks: () => clearDeclaredLifecycleHooks,
	declaredLifecycleHooks: () => declaredLifecycleHooks
});
/**
* Gets or creates the mutable lifecycle hooks record directly on `globalManifest`.
* Used exclusively for write operations (e.g., registering a hook) so that
* `globalManifest.lifecycleHooks` is created lazily on demand.
*/
function getOrCreateDeclaredLifecycleHooks() {
	if (!require_runtime_manifest.globalManifest.lifecycleHooks || typeof require_runtime_manifest.globalManifest.lifecycleHooks !== "object") {
		require_runtime_manifest.globalManifest.lifecycleHooks = {};
	}
	return require_runtime_manifest.globalManifest.lifecycleHooks;
}
/**
* Gets the existing lifecycle hooks record on `globalManifest` if defined,
* or returns a fallback empty object without mutating `globalManifest`.
* Used for read-only operations (e.g., property lookup, keys, descriptors)
* to avoid emitting an unwanted empty `lifecycleHooks: {}` into the manifest.
*/
function getExistingDeclaredLifecycleHooks() {
	if (!require_runtime_manifest.globalManifest.lifecycleHooks || typeof require_runtime_manifest.globalManifest.lifecycleHooks !== "object") {
		return {};
	}
	return require_runtime_manifest.globalManifest.lifecycleHooks;
}
/**
* Shared dictionary of declared lifecycle hooks.
*
* NOTE: A Proxy is necessary here because `lifecycleHooks` is only initialized
* on `globalManifest` when hooks are registered (to avoid emitting empty `{}`
* into the manifest). The Proxy dynamically delegates all property reads, writes,
* and key enumerations directly to `globalManifest.lifecycleHooks` on `globalThis`,
* ensuring dual-package hazard protection across ESM/CJS or duplicate module contexts.
*
* @internal
*/
const declaredLifecycleHooks = new Proxy({}, {
	get(_, prop) {
		if (typeof prop === "string") {
			return getExistingDeclaredLifecycleHooks()[prop];
		}
		return undefined;
	},
	set(_, prop, value) {
		if (typeof prop === "string") {
			getOrCreateDeclaredLifecycleHooks()[prop] = value;
			return true;
		}
		return false;
	},
	deleteProperty(_, prop) {
		if (typeof prop === "string" && require_runtime_manifest.globalManifest.lifecycleHooks) {
			const hooks = require_runtime_manifest.globalManifest.lifecycleHooks;
			delete hooks[prop];
			if (Object.keys(hooks).length === 0) {
				delete require_runtime_manifest.globalManifest.lifecycleHooks;
			}
			return true;
		}
		return false;
	},
	has(_, prop) {
		return Reflect.has(getExistingDeclaredLifecycleHooks(), prop);
	},
	ownKeys() {
		return Reflect.ownKeys(getExistingDeclaredLifecycleHooks());
	},
	getOwnPropertyDescriptor(_, prop) {
		const hooks = getExistingDeclaredLifecycleHooks();
		if (typeof prop === "string" && prop in hooks) {
			return {
				enumerable: true,
				configurable: true,
				writable: true,
				value: hooks[prop]
			};
		}
		return undefined;
	}
});
/**
* Registers an action to be executed automatically post-deployment when resources in this codebase
* are deployed for the first time.
*
* @param action The lifecycle action to execute.
*/
function afterFirstDeploy(action) {
	const hooks = getOrCreateDeclaredLifecycleHooks();
	if (hooks.afterFirstDeploy) {
		throw new Error("Only one afterFirstDeploy lifecycle hook is allowed per codebase.");
	}
	hooks.afterFirstDeploy = action;
}
/**
* Registers an action to be executed automatically post-deployment when resources in this codebase
* are updated.
*
* @param action The lifecycle action to execute.
*/
function afterRedeploy(action) {
	const hooks = getOrCreateDeclaredLifecycleHooks();
	if (hooks.afterRedeploy) {
		throw new Error("Only one afterRedeploy lifecycle hook is allowed per codebase.");
	}
	hooks.afterRedeploy = action;
}
/**
* Helper to clear declared lifecycle hooks.
* @internal
*/
function clearDeclaredLifecycleHooks() {
	delete require_runtime_manifest.globalManifest.lifecycleHooks;
}

//#endregion
exports.afterFirstDeploy = afterFirstDeploy;
exports.afterRedeploy = afterRedeploy;
exports.clearDeclaredLifecycleHooks = clearDeclaredLifecycleHooks;
exports.declaredLifecycleHooks = declaredLifecycleHooks;
Object.defineProperty(exports, 'lifecycle_exports', {
  enumerable: true,
  get: function () {
    return lifecycle_exports;
  }
});