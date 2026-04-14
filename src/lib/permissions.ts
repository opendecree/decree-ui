import type { Role } from "./constants";

/** Check if the current role can edit config values. */
export function canEditConfig(role: Role): boolean {
	return role === "superadmin" || role === "admin";
}

/** Check if the current role can manage schemas (create, import, publish). */
export function canManageSchemas(role: Role): boolean {
	return role === "superadmin";
}

/** Check if the current role can manage tenants (create, delete). */
export function canManageTenants(role: Role): boolean {
	return role === "superadmin";
}

/** Check if the current role can lock/unlock fields. */
export function canManageLocks(role: Role): boolean {
	return role === "superadmin" || role === "admin";
}
