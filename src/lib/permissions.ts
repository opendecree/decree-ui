import type { components } from "../api/schema";
import type { Role } from "./constants";

type SchemaField = components["schemas"]["v1SchemaField"];

/** Check if the current role can edit config values. */
export function canEditConfig(role: Role): boolean {
	return role === "superadmin" || role === "admin";
}

/** Inputs that gate whether a single field is editable, beyond the bare role. */
export interface FieldEditContext {
	/** Whether the field currently holds a value (drives write-once enforcement). */
	hasValue: boolean;
	/** Whether the field carries an active lock for this tenant. */
	isLocked: boolean;
}

/** Why a field can't be edited — used to render the right disabled affordance. */
export type FieldEditBlock = "role" | "read-only" | "write-once" | "locked";

/**
 * Resolve whether `role` may edit a specific field, and if not, why. The server is
 * the final authority (it re-guards every write); this mirrors that guard chain so
 * the UI can disable + explain before the round-trip.
 *
 * Enforcement, in order of precedence:
 *  - `read_only` — system-managed, never editable, *including superadmin*.
 *  - write-once + already set — immutable once written, *including superadmin*.
 *  - lock — admins are blocked; **superadmin bypasses locks**.
 *  - role — only config editors (admin, superadmin) can edit at all.
 */
export function fieldEditBlock(
	role: Role,
	field: Pick<SchemaField, "readOnly" | "writeOnce">,
	ctx: FieldEditContext,
): FieldEditBlock | null {
	if (!canEditConfig(role)) return "role";
	// Absolute locks — apply to every role, superadmin included.
	if (field.readOnly) return "read-only";
	if (field.writeOnce && ctx.hasValue) return "write-once";
	// Field locks — admin blocked, superadmin bypasses.
	if (ctx.isLocked && role !== "superadmin") return "locked";
	return null;
}

/** Convenience boolean: can this role edit this field right now? */
export function canEditField(
	role: Role,
	field: Pick<SchemaField, "readOnly" | "writeOnce">,
	ctx: FieldEditContext,
): boolean {
	return fieldEditBlock(role, field, ctx) === null;
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
