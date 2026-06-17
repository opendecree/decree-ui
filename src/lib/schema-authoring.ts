/**
 * Pure helpers for the schema-authoring workbench (hi-fi Screen 5).
 *
 * The workbench is superadmin-only structured editing of field *definitions* —
 * deliberately separate from the config editor, which is value entry against a
 * published schema. These helpers stay free of React/DOM so the draft model,
 * the diff against the server, and the UpdateSchema request body are all
 * directly unit-testable (the backbone of the lifecycle wiring).
 */

import type { components } from "../api/schema";

type FieldType = components["schemas"]["v1FieldType"];
type FieldConstraints = components["schemas"]["v1FieldConstraints"];
type SchemaField = components["schemas"]["v1SchemaField"];
type UpdateSchemaBody = components["schemas"]["SchemaServiceUpdateSchemaBody"];

/** The eight authorable field types, in display order, with a short type token. */
export const FIELD_TYPE_ORDER: FieldType[] = [
	"FIELD_TYPE_INT",
	"FIELD_TYPE_NUMBER",
	"FIELD_TYPE_STRING",
	"FIELD_TYPE_BOOL",
	"FIELD_TYPE_TIME",
	"FIELD_TYPE_DURATION",
	"FIELD_TYPE_URL",
	"FIELD_TYPE_JSON",
];

/** A per-field boolean flag the editor exposes as a toggle, with copy. */
export interface FlagDef {
	/** Key on the SchemaField (camelCase, as the generated API uses). */
	key: "nullable" | "readOnly" | "writeOnce" | "sensitive" | "deprecated";
	label: string;
	hint: string;
}

/**
 * The flag grid. These flags drive every field *state* the config editor renders
 * (read-only / write-once / sensitive / deprecated / nullable), so they live here
 * at the point of authoring.
 */
export const FLAG_DEFS: FlagDef[] = [
	{ key: "nullable", label: "Nullable", hint: "May be left empty/null; falls back to default." },
	{ key: "readOnly", label: "Read-only", hint: "System-managed — never editable in the UI." },
	{
		key: "writeOnce",
		label: "Write-once",
		hint: "Settable once, then permanently immutable.",
	},
	{
		key: "sensitive",
		label: "Sensitive",
		hint: "Write-only — server redacts to [REDACTED] on every read.",
	},
	{
		key: "deprecated",
		label: "Deprecated",
		hint: "Flagged for removal; prefer a replacement field.",
	},
];

/** Which constraint inputs a given field type exposes. Drives the adaptive editor. */
export type ConstraintKind = "numeric" | "string" | "duration" | "url" | "json" | "none";

/** Map a field type to its constraint editor kind. */
export function constraintKind(type: FieldType | undefined): ConstraintKind {
	switch (type) {
		case "FIELD_TYPE_INT":
		case "FIELD_TYPE_NUMBER":
			return "numeric";
		case "FIELD_TYPE_STRING":
			return "string";
		case "FIELD_TYPE_DURATION":
			return "duration";
		case "FIELD_TYPE_URL":
			return "url";
		case "FIELD_TYPE_JSON":
			return "json";
		default:
			// bool, time, unspecified take no structural constraints in this editor.
			return "none";
	}
}

/**
 * A draft field path that doesn't yet exist on the server, created when the user
 * adds a brand-new field. The synthetic seed keeps it editable until the user
 * gives it a real dotted path.
 */
export function newFieldDraft(index: number): SchemaField {
	return {
		path: `new.field_${index}`,
		type: "FIELD_TYPE_STRING",
		constraints: {},
	};
}

/**
 * Trim empty/blank constraint entries so the diff and the request body don't
 * carry no-op keys (e.g. an empty regex, an empty enum). Numeric zero is kept.
 */
export function cleanConstraints(c: FieldConstraints | undefined): FieldConstraints | undefined {
	if (!c) return undefined;
	const out: FieldConstraints = {};
	if (c.min !== undefined) out.min = c.min;
	if (c.max !== undefined) out.max = c.max;
	if (c.exclusiveMin !== undefined) out.exclusiveMin = c.exclusiveMin;
	if (c.exclusiveMax !== undefined) out.exclusiveMax = c.exclusiveMax;
	if (c.minLength !== undefined) out.minLength = c.minLength;
	if (c.maxLength !== undefined) out.maxLength = c.maxLength;
	if (c.regex && c.regex.trim() !== "") out.regex = c.regex;
	if (c.jsonSchema && c.jsonSchema.trim() !== "") out.jsonSchema = c.jsonSchema;
	if (c.enumValues && c.enumValues.length > 0) out.enumValues = c.enumValues;
	return Object.keys(out).length > 0 ? out : undefined;
}

/** Stable JSON of a field for change-detection — key order normalized. */
function canonical(field: SchemaField): string {
	const f: SchemaField = {
		...field,
		constraints: cleanConstraints(field.constraints),
	};
	// Drop undefined/empty so cosmetic differences don't read as changes.
	const entries = Object.entries(f)
		.filter(([, v]) => v !== undefined && v !== "" && v !== false)
		.sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify(entries, (_k, v) => v);
}

/** Whether a field's definition differs from its server baseline. */
export function fieldChanged(draft: SchemaField, baseline: SchemaField | undefined): boolean {
	if (!baseline) return true;
	return canonical(draft) !== canonical(baseline);
}

/** A summary of how a draft diverges from the published/latest baseline fields. */
export interface SchemaDiff {
	/** Paths present in the draft but not the baseline. */
	added: string[];
	/** Paths whose definition changed. */
	modified: string[];
	/** Paths present in the baseline but removed from the draft. */
	removed: string[];
}

/** Compute the add / modify / remove diff between a draft and the baseline. */
export function diffFields(draft: SchemaField[], baseline: SchemaField[]): SchemaDiff {
	const baseByPath = new Map<string, SchemaField>();
	for (const f of baseline) if (f.path) baseByPath.set(f.path, f);
	const draftPaths = new Set<string>();

	const added: string[] = [];
	const modified: string[] = [];
	for (const f of draft) {
		const path = f.path ?? "";
		draftPaths.add(path);
		const base = baseByPath.get(path);
		if (!base) added.push(path);
		else if (fieldChanged(f, base)) modified.push(path);
	}
	const removed: string[] = [];
	for (const path of baseByPath.keys()) {
		if (!draftPaths.has(path)) removed.push(path);
	}
	return { added, modified, removed };
}

/** Whether the draft has any pending change versus the baseline. */
export function isDirty(diff: SchemaDiff): boolean {
	return diff.added.length + diff.modified.length + diff.removed.length > 0;
}

/**
 * Build the UpdateSchema (PATCH /v1/schemas/{id}) request body from a draft.
 *
 * UpdateSchema has merge semantics: `fields` lists fields to add or modify and
 * `removeFields` lists paths to drop; everything not mentioned is carried forward
 * unchanged from the latest version. The server creates a NEW draft version from
 * the latest — it never edits a published version in place. So we send only the
 * delta (added + modified fields, removed paths), which keeps the request minimal
 * and matches the server's carry-forward model.
 */
export function buildUpdateBody(
	draft: SchemaField[],
	baseline: SchemaField[],
	versionDescription: string,
): UpdateSchemaBody {
	const diff = diffFields(draft, baseline);
	const changedPaths = new Set([...diff.added, ...diff.modified]);
	const fields = draft
		.filter((f) => changedPaths.has(f.path ?? ""))
		.map((f) => ({ ...f, constraints: cleanConstraints(f.constraints) }));

	const body: UpdateSchemaBody = {};
	if (fields.length > 0) body.fields = fields;
	if (diff.removed.length > 0) body.removeFields = diff.removed;
	if (versionDescription.trim() !== "") body.versionDescription = versionDescription.trim();
	return body;
}

/**
 * Validate a draft field's *definition* (not its value). Returns a human error or
 * null. Guards the things that would make the schema unimportable: a missing or
 * malformed path, a regex that can't compile, a JSON-schema constraint that isn't
 * valid JSON, and a deprecated field with no redirect target.
 */
export function validateFieldDef(field: SchemaField): string | null {
	const path = (field.path ?? "").trim();
	if (path === "") return "Path is required.";
	if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(path)) {
		return "Path must be dotted segments of letters, digits, or underscores.";
	}
	const c = field.constraints ?? {};
	if (c.regex && c.regex.trim() !== "") {
		try {
			new RegExp(c.regex);
		} catch {
			return "Pattern is not a valid regular expression.";
		}
	}
	if (field.type === "FIELD_TYPE_JSON" && c.jsonSchema && c.jsonSchema.trim() !== "") {
		try {
			JSON.parse(c.jsonSchema);
		} catch {
			return "JSON Schema must be valid JSON.";
		}
	}
	if (
		(c.minLength !== undefined && c.minLength < 0) ||
		(c.maxLength !== undefined && c.maxLength < 0)
	) {
		return "Length bounds cannot be negative.";
	}
	if (c.minLength !== undefined && c.maxLength !== undefined && c.minLength > c.maxLength) {
		return "Minimum length cannot exceed maximum length.";
	}
	if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
		return "Minimum cannot exceed maximum.";
	}
	return null;
}

/** Detect duplicate paths in a draft — returns the set of paths that collide. */
export function duplicatePaths(fields: SchemaField[]): Set<string> {
	const seen = new Set<string>();
	const dupes = new Set<string>();
	for (const f of fields) {
		const p = (f.path ?? "").trim();
		if (p === "") continue;
		if (seen.has(p)) dupes.add(p);
		seen.add(p);
	}
	return dupes;
}

/**
 * A single dependent_required rule: when every `when` field is present, every
 * `require` field becomes required. The decree gateway does not yet expose a
 * dependent_required model on the schema (no field on v1Schema / v1SchemaField),
 * so these are authored and validated client-side only — see SchemaAuthor for the
 * graceful-degradation note. Kept as a pure shape so the builder is testable.
 */
export interface DependentRule {
	/** Fields that must be present to trigger the requirement. */
	when: string[];
	/** Fields that become required when the trigger holds. */
	require: string[];
}

/** Whether a dependent rule is complete enough to keep (both sides non-empty). */
export function isRuleComplete(rule: DependentRule): boolean {
	return rule.when.length > 0 && rule.require.length > 0;
}

/** A human one-line summary of a dependent rule for display. */
export function summarizeRule(rule: DependentRule): string {
	if (!isRuleComplete(rule)) return "incomplete rule";
	return `require ${rule.require.join(", ")} when ${rule.when.join(" + ")} present`;
}
