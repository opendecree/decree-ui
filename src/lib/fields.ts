import type { components } from "../api/schema";

type SchemaField = components["schemas"]["v1SchemaField"];

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
