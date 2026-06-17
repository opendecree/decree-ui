/**
 * Pure helpers for the version-history diff.
 *
 * The REST gateway exposes no diff model and no full config snapshot at a
 * historical version (`GetVersion` returns only metadata). The only per-version
 * field-delta source is the audit log: every `SetField` write records an entry
 * with `old_value`/`new_value` for the field it touched, tagged with the
 * `config_version` it produced. So the per-version diff is computed *client-side*
 * by collecting the audit entries that created a given version.
 *
 * Keeping the change-type derivation and the rollback re-guard prediction pure
 * (no React, no DOM) makes them directly unit-testable — the backbone of the
 * history screen's correctness.
 */

import type { components } from "../api/schema";
import type { Role } from "./constants";
import { type FieldEditBlock, fieldEditBlock } from "./permissions";
import { validateField } from "./validation";

type AuditEntry = components["schemas"]["v1AuditEntry"];
type SchemaField = components["schemas"]["v1SchemaField"];

/** What happened to a field between a version and its predecessor. */
export type ChangeType = "added" | "removed" | "modified";

/** A single field-level change within one config version. */
export interface FieldDiff {
	/** Dot-separated field path (e.g. "payments.fee_rate"). */
	path: string;
	changeType: ChangeType;
	/** Predecessor value (raw audit string). `null` when the field was added. */
	oldValue: string | null;
	/** New value (raw audit string). `null` when the field was removed. */
	newValue: string | null;
	/**
	 * Whether the field is sensitive in the schema. The server already redacts
	 * sensitive values to the literal `[REDACTED]` on every read path, including
	 * the audit log, so both sides must render redacted — never the raw string.
	 */
	sensitive: boolean;
	/** The field type, for the type glyph (undefined if not in the schema). */
	fieldType?: components["schemas"]["v1FieldType"];
}

/** Derive the change type from the presence of old/new values in an audit entry. */
export function changeTypeOf(entry: Pick<AuditEntry, "oldValue" | "newValue">): ChangeType {
	const hadOld = entry.oldValue !== undefined && entry.oldValue !== null;
	const hasNew = entry.newValue !== undefined && entry.newValue !== null;
	if (!hadOld && hasNew) return "added";
	if (hadOld && !hasNew) return "removed";
	return "modified";
}

/**
 * Build the field-level diff for one config version from the audit entries that
 * produced it. Only field-mutating entries (those carrying a `fieldPath`) are
 * diffed; rollback marker entries (no field path) are skipped. Sensitivity and
 * the type glyph are resolved from the schema by path.
 */
export function buildFieldDiffs(
	entries: AuditEntry[],
	fieldByPath: Map<string, SchemaField>,
): FieldDiff[] {
	const out: FieldDiff[] = [];
	for (const e of entries) {
		if (!e.fieldPath) continue;
		const field = fieldByPath.get(e.fieldPath);
		out.push({
			path: e.fieldPath,
			changeType: changeTypeOf(e),
			oldValue: e.oldValue ?? null,
			newValue: e.newValue ?? null,
			sensitive: field?.sensitive ?? false,
			fieldType: field?.type,
		});
	}
	// Stable, predictable order for the diff body + tests.
	out.sort((a, b) => a.path.localeCompare(b.path));
	return out;
}

/** A field whose restore would be rejected when rolling back, with the reason. */
export interface ReguardConflict {
	path: string;
	/** Why the restore is blocked (locked / read-only / write-once / role). */
	block: FieldEditBlock | "invalid";
	/** Validation message when the restored value is invalid under current rules. */
	detail?: string;
}

/**
 * Predict the server's atomic re-guard of a rollback. `RollbackToVersion`
 * re-writes every field whose value differs from the current config, then
 * re-guards each against the *current* rules; if any one is locked / read-only /
 * write-once / invalid, the whole rollback is rejected (nothing written). This
 * mirrors that guard chain client-side — routed through the same
 * `fieldEditBlock` helper the config editor uses — so the UI can warn before the
 * round-trip. The server stays the final authority.
 *
 * `restoredValues` is the set of fields the rollback would write (path -> the
 * value being restored), already narrowed to those that differ from current.
 */
export function predictReguard(
	role: Role,
	restoredValues: Map<string, string>,
	fieldByPath: Map<string, SchemaField>,
	lockedPaths: Set<string>,
	currentHasValue: (path: string) => boolean,
): ReguardConflict[] {
	const conflicts: ReguardConflict[] = [];
	for (const [path, value] of restoredValues) {
		const field = fieldByPath.get(path);
		if (!field) continue;
		const block = fieldEditBlock(role, field, {
			hasValue: currentHasValue(path),
			isLocked: lockedPaths.has(path),
		});
		if (block !== null) {
			conflicts.push({ path, block });
			continue;
		}
		// Field-level guards pass; the value must also still be valid under the
		// current schema constraints (write-once/read-only already handled above).
		const err = validateField(field, value);
		if (err) conflicts.push({ path, block: "invalid", detail: err });
	}
	conflicts.sort((a, b) => a.path.localeCompare(b.path));
	return conflicts;
}
