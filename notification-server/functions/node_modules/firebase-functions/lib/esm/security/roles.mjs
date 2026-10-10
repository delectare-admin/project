import { globalManifest } from "../runtime/manifest.mjs";

//#region src/security/roles.ts
const EMPTY_ROLES = Object.freeze([]);
function getDeclaredRolesList() {
	if (!Array.isArray(globalManifest.requiredRoles)) {
		return EMPTY_ROLES;
	}
	return globalManifest.requiredRoles;
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
		if (!Array.isArray(globalManifest.requiredRoles)) {
			return false;
		}
		const roles = globalManifest.requiredRoles;
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
		delete globalManifest.requiredRoles;
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
	if (!Array.isArray(globalManifest.requiredRoles)) {
		globalManifest.requiredRoles = [];
	}
	const roles = globalManifest.requiredRoles;
	if (!roles.includes(role)) {
		roles.push(role);
	}
}

//#endregion
export { declaredRoles, registerRole };