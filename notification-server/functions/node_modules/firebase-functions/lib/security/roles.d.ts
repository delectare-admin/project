/**
 * Global set of declared IAM roles required by this codebase.
 *
 * NOTE: This cannot be a native `Set` because `globalManifest.requiredRoles`
 * is stored directly as a wire-ready `string[]` on `globalThis` so that
 * any manifest loader (even older harness versions) can simply spread
 * `...globalManifest` without needing role-specific Set-to-Array conversion.
 * `declaredRoles` implements the full `Set` interface for backwards compatibility.
 */
export declare const declaredRoles: any;
