const require_runtime_manifest = require('../runtime/manifest.js');

//#region src/security/roles.ts
const EMPTY_ROLES = Object.freeze([]);
function getDeclaredRolesList() {
	if (!Array.isArray(require_runtime_manifest.globalManifest.requiredRoles)) {
		return EMPTY_ROLES;
	}
	return require_runtime_manifest.globalManifest.requiredRoles;
}
/**
* Global set of declared IAM roles required by this codebase.
*
* NOTE: This cannot be a native `Set` because `globalManifest.requiredRoles`
* is stored directly as a wire-ready `string[]` on `globalThis` so that
* any manifest loader (even older harness versions) can simply spread
* `...globalManifest` without needing role-specific Set-to-Array conversion.
* `declaredRoles` implements the full `Set` interface for backwards compatibility.
*/
const declaredRoles = {
	get size() {
		return getDeclaredRolesList().length;
	},
	add(role) {
		registerRole(role);
	},
	delete(role) {
		if (!Array.isArray(require_runtime_manifest.globalManifest.requiredRoles)) {
			return false;
		}
		const roles = require_runtime_manifest.globalManifest.requiredRoles;
		const idx = roles.indexOf(role);
		if (idx !== -1) {
			roles.splice(idx, 1);
			return true;
		}
		return false;
	},
	has(role) {
		return getDeclaredRolesList().includes(role);
	},
	clear() {
		delete require_runtime_manifest.globalManifest.requiredRoles;
	},
	keys() {
		return getDeclaredRolesList()[Symbol.iterator]();
	},
	values() {
		return getDeclaredRolesList()[Symbol.iterator]();
	},
	*entries() {
		for (const role of getDeclaredRolesList()) {
			yield [role, role];
		}
	},
	[Symbol.iterator]() {
		return getDeclaredRolesList()[Symbol.iterator]();
	},
	forEach(callback) {
		for (const role of getDeclaredRolesList()) {
			callback(role, role, declaredRoles);
		}
	}
};
/**
* Registers a role to be required by this codebase.
* Automatically deduplicates roles in globalManifest.requiredRoles.
* @internal
*/
function registerRole(role) {
	if (!Array.isArray(require_runtime_manifest.globalManifest.requiredRoles)) {
		require_runtime_manifest.globalManifest.requiredRoles = [];
	}
	const roles = require_runtime_manifest.globalManifest.requiredRoles;
	if (!roles.includes(role)) {
		roles.push(role);
	}
}

//#endregion
exports.declaredRoles = declaredRoles;
exports.registerRole = registerRole;