import type { components } from "../api/schema";

type FieldType = components["schemas"]["v1FieldType"];
type FieldConstraints = components["schemas"]["v1FieldConstraints"];
type SchemaField = components["schemas"]["v1SchemaField"];

/**
 * Per-constraint, client-side validation for a single typed field value. Mirrors
 * the server's schema constraints so the editor can flag errors live (and disable
 * Save) before the write round-trips — the server stays the final authority.
 *
 * `value` is the string form the editor holds (the same encoding SetField expects):
 * decimal for int/number, "true"/"false" for bool, Go-duration for duration,
 * RFC 3339 for time, raw JSON text for json.
 *
 * Returns a human-readable error string, or null when the value is valid.
 */
export function validateField(field: SchemaField, value: string): string | null {
	const c = field.constraints ?? {};
	const trimmed = value.trim();
	const empty = trimmed === "";

	// Empty handling: a nullable field may be cleared (explicit null / unset);
	// a non-nullable field requires a value.
	if (empty) {
		return field.nullable ? null : "Required — this field has no value.";
	}

	// Enum applies to any type.
	if (c.enumValues && c.enumValues.length > 0 && !c.enumValues.includes(value)) {
		return `Must be one of: ${c.enumValues.join(", ")}.`;
	}

	switch (field.type) {
		case "FIELD_TYPE_INT":
			return validateInt(trimmed, c);
		case "FIELD_TYPE_NUMBER":
			return validateNumber(trimmed, c);
		case "FIELD_TYPE_BOOL":
			return value === "true" || value === "false" ? null : 'Must be "true" or "false".';
		case "FIELD_TYPE_STRING":
			return validateString(value, c);
		case "FIELD_TYPE_DURATION":
			return validateDuration(trimmed, c);
		case "FIELD_TYPE_TIME":
			return validateTime(trimmed);
		case "FIELD_TYPE_URL":
			return validateUrl(trimmed);
		case "FIELD_TYPE_JSON":
			return validateJson(value);
		default:
			return null;
	}
}

function validateInt(v: string, c: FieldConstraints): string | null {
	if (!/^-?\d+$/.test(v)) return "Must be a whole number.";
	return numericBounds(Number(v), c);
}

function validateNumber(v: string, c: FieldConstraints): string | null {
	if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return "Must be a number.";
	return numericBounds(Number(v), c);
}

/** Shared min/max/exclusive bounds for int, number, and duration (in seconds). */
function numericBounds(n: number, c: FieldConstraints, unit = ""): string | null {
	const u = unit ? ` ${unit}` : "";
	if (c.min !== undefined && n < c.min) return `Below minimum — must be ≥ ${c.min}${u}.`;
	if (c.max !== undefined && n > c.max) return `Above maximum — must be ≤ ${c.max}${u}.`;
	if (c.exclusiveMin !== undefined && n <= c.exclusiveMin)
		return `Must be greater than ${c.exclusiveMin}${u}.`;
	if (c.exclusiveMax !== undefined && n >= c.exclusiveMax)
		return `Must be less than ${c.exclusiveMax}${u}.`;
	return null;
}

function validateString(v: string, c: FieldConstraints): string | null {
	if (c.minLength !== undefined && v.length < c.minLength)
		return `Too short — at least ${c.minLength} characters (now ${v.length}).`;
	if (c.maxLength !== undefined && v.length > c.maxLength)
		return `Too long — at most ${c.maxLength} characters (now ${v.length}).`;
	if (c.regex) {
		let re: RegExp;
		try {
			re = new RegExp(c.regex);
		} catch {
			// An unparseable schema pattern shouldn't block the user; the server validates.
			return null;
		}
		if (!re.test(v)) return `Does not match the required pattern: ${c.regex}`;
	}
	return null;
}

/** Parse a Go-style duration ("24h", "90m", "1h30m", "500ms") to seconds, or null. */
export function parseGoDuration(str: string): number | null {
	if (!/^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(str)) return null;
	const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
	const mult: Record<string, number> = {
		ns: 1e-9,
		us: 1e-6,
		µs: 1e-6,
		ms: 1e-3,
		s: 1,
		m: 60,
		h: 3600,
	};
	let m: RegExpExecArray | null;
	let total = 0;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
	while ((m = re.exec(str)) !== null) {
		total += Number.parseFloat(m[1]) * mult[m[2]];
	}
	return total;
}

function validateDuration(v: string, c: FieldConstraints): string | null {
	const seconds = parseGoDuration(v);
	if (seconds === null) return "Invalid Go duration — e.g. 24h, 90m, 1h30m, 500ms.";
	// Duration min/max constraints are expressed in seconds.
	return numericBounds(seconds, c, "s");
}

function validateTime(v: string): string | null {
	const d = new Date(v);
	return Number.isNaN(d.getTime())
		? "Invalid timestamp — use RFC 3339 (e.g. 2025-01-15T09:30:00Z)."
		: null;
}

function validateUrl(v: string): string | null {
	try {
		const u = new URL(v);
		if (!u.protocol || !u.host) return "Must be an absolute URL.";
		return null;
	} catch {
		return "Not a valid URL.";
	}
}

function validateJson(v: string): string | null {
	try {
		JSON.parse(v);
		return null;
	} catch {
		return "Must be valid JSON.";
	}
}

/** A short, monospace hint describing the field's type + active constraints. */
export function constraintHint(field: SchemaField): string {
	const c = field.constraints ?? {};
	const parts: string[] = [typeWord(field.type)];
	if (field.format) parts.push(`format ${field.format}`);
	if (c.min !== undefined) parts.push(`min ${c.min}`);
	if (c.max !== undefined) parts.push(`max ${c.max}`);
	if (c.exclusiveMin !== undefined) parts.push(`> ${c.exclusiveMin}`);
	if (c.exclusiveMax !== undefined) parts.push(`< ${c.exclusiveMax}`);
	if (c.minLength !== undefined && c.maxLength !== undefined)
		parts.push(`${c.minLength}–${c.maxLength} chars`);
	else if (c.minLength !== undefined) parts.push(`≥ ${c.minLength} chars`);
	else if (c.maxLength !== undefined) parts.push(`≤ ${c.maxLength} chars`);
	if (c.regex) parts.push("pattern");
	if (c.jsonSchema) parts.push("json-schema");
	return parts.join(" · ");
}

function typeWord(type: FieldType | undefined): string {
	switch (type) {
		case "FIELD_TYPE_INT":
			return "int";
		case "FIELD_TYPE_NUMBER":
			return "number";
		case "FIELD_TYPE_BOOL":
			return "bool";
		case "FIELD_TYPE_STRING":
			return "string";
		case "FIELD_TYPE_DURATION":
			return "duration";
		case "FIELD_TYPE_TIME":
			return "time";
		case "FIELD_TYPE_URL":
			return "url";
		case "FIELD_TYPE_JSON":
			return "json";
		default:
			return "value";
	}
}
