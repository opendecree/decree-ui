/**
 * Provenance resolution for a field's *empty* read state.
 *
 * A nullable field has two distinct empty states the UI must not conflate:
 *
 *  - **unset** — no per-tenant value was ever written, so the schema default
 *    resolves. There is no audit entry that set (or cleared) the field.
 *  - **explicit null** — the field was deliberately written to null, which
 *    *overrides* the default. The most recent audit entry for the field cleared
 *    it (an `old_value` existed, the `new_value` is empty/absent — or the action
 *    is a clear), so a stored null is a value, not the absence of one.
 *
 * The REST gateway models neither a null member on `TypedValue` nor a provenance
 * flag on `ConfigValue` (a cleared field simply isn't in `config.values`). The
 * only signal that distinguishes "cleared" from "never set" is the audit log, the
 * same per-field delta source the read view already walks for provenance. This
 * keeps the derivation pure and unit-testable.
 */

import type { components } from "../api/schema";

type AuditEntry = components["schemas"]["v1AuditEntry"];

/** The resolved state of a field that currently holds no value. */
export type EmptyProvenance = "explicit-null" | "unset";

/** The classified read state of a field, plus the provenance metadata behind it. */
export interface FieldProvenance {
	/** "set" when the field holds a value; otherwise how the empty resolves. */
	state: "set" | EmptyProvenance;
	/** Actor of the most recent change to this field, if any. */
	actor?: string;
	/** Timestamp of the most recent change to this field, if any. */
	time?: string;
	/** Config version of the most recent change to this field, if any. */
	version?: number;
}

/** Whether an audit entry represents a clear (a deliberate write of null). */
function isClearEntry(entry: AuditEntry): boolean {
	// A set_field whose new value is empty/absent but which had a prior value is a
	// clear. An explicit "clear"/"unset" action name is also honoured if present.
	const action = (entry.action ?? "").toLowerCase();
	if (action.includes("clear") || action.includes("unset")) return true;
	if (entry.fieldPath === undefined) return false;
	const hadOld = entry.oldValue !== undefined && entry.oldValue !== "";
	const hasNew = entry.newValue !== undefined && entry.newValue !== "";
	return hadOld && !hasNew;
}

/**
 * Find the most recent audit entry for a field path. Entries are assumed to be in
 * the gateway's newest-first order (the order `useAuditLog` returns), so the first
 * match wins; we fall back to the highest `config_version` when ordering is mixed.
 */
export function latestEntryForField(
	entries: AuditEntry[],
	fieldPath: string,
): AuditEntry | undefined {
	let best: AuditEntry | undefined;
	for (const e of entries) {
		if (e.fieldPath !== fieldPath) continue;
		if (best === undefined) {
			best = e;
			continue;
		}
		// Prefer a higher config version when both carry one (defends against a
		// caller passing un-sorted entries); otherwise keep the first seen.
		if ((e.configVersion ?? -1) > (best.configVersion ?? -1)) best = e;
	}
	return best;
}

/**
 * Resolve a field's read state from its current value presence and the audit log.
 *
 * @param fieldPath   the dot-path being resolved
 * @param hasValue    whether `config.values` currently carries a value for it
 * @param entries     audit entries (newest-first preferred; mixed order tolerated)
 */
export function resolveFieldProvenance(
	fieldPath: string,
	hasValue: boolean,
	entries: AuditEntry[],
): FieldProvenance {
	const latest = latestEntryForField(entries, fieldPath);
	const meta = latest
		? { actor: latest.actor, time: latest.createdAt, version: latest.configVersion }
		: {};

	if (hasValue) return { state: "set", ...meta };

	// No current value: an explicit clear in the audit log means a stored null
	// (overrides the default); otherwise the field was never set (default applies).
	if (latest && isClearEntry(latest)) return { state: "explicit-null", ...meta };
	return { state: "unset" };
}
