import type { components } from "../api/schema";

type SchemaField = components["schemas"]["v1SchemaField"];
type TypedValue = components["schemas"]["v1TypedValue"];

export interface FieldGroup {
	name: string;
	fields: SchemaField[];
}

/** Group fields by first tag if present, otherwise by dot-path prefix. */
export function groupFields(fields: SchemaField[]): FieldGroup[] {
	const hasTags = fields.some((f) => f.tags && f.tags.length > 0);
	const groups = new Map<string, SchemaField[]>();

	for (const field of fields) {
		let group: string;
		if (hasTags && field.tags && field.tags.length > 0) {
			group = field.tags[0];
		} else {
			const parts = field.path?.split(".") ?? [];
			group = parts.length > 1 ? parts[0] : "";
		}
		const list = groups.get(group) ?? [];
		list.push(field);
		groups.set(group, list);
	}

	const result: FieldGroup[] = [];
	for (const [name, gf] of groups) {
		result.push({ name, fields: gf });
	}
	return result;
}

/** Render a proto TypedValue as a display string (the union's set member). */
export function typedValueToString(tv: TypedValue | undefined): string {
	if (!tv) return "";
	if (tv.stringValue !== undefined) return tv.stringValue;
	if (tv.integerValue !== undefined) return String(tv.integerValue);
	if (tv.numberValue !== undefined) return String(tv.numberValue);
	if (tv.boolValue !== undefined) return String(tv.boolValue);
	if (tv.timeValue !== undefined) return tv.timeValue;
	if (tv.durationValue !== undefined) return tv.durationValue;
	if (tv.urlValue !== undefined) return tv.urlValue;
	if (tv.jsonValue !== undefined) return tv.jsonValue;
	return "";
}

/** Format a duration string (e.g. "86400s") into human-readable form (e.g. "24h"). */
export function formatDuration(raw: string): string {
	const match = raw.match(/^(\d+(?:\.\d+)?)s$/);
	if (!match) return raw;
	const totalSeconds = Number(match[1]);
	if (totalSeconds === 0) return "0s";
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const parts: string[] = [];
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (seconds > 0) parts.push(`${seconds}s`);
	return parts.join("") || "0s";
}
