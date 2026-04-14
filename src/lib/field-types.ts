import type { components } from "../api/schema";
import {
	ICON_BOOLEAN,
	ICON_DURATION,
	ICON_INTEGER,
	ICON_JSON,
	ICON_NUMBER,
	ICON_STRING,
	ICON_TIME,
	ICON_UNKNOWN,
	ICON_URL,
} from "./icons";

type FieldType = components["schemas"]["v1FieldType"];

interface FieldTypeMeta {
	label: string;
	icon: string;
	color: string;
}

const meta: Record<FieldType, FieldTypeMeta> = {
	FIELD_TYPE_UNSPECIFIED: {
		label: "Unknown",
		icon: ICON_UNKNOWN,
		color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
	},
	FIELD_TYPE_INT: {
		label: "Integer",
		icon: ICON_INTEGER,
		color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
	},
	FIELD_TYPE_STRING: {
		label: "String",
		icon: ICON_STRING,
		color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
	},
	FIELD_TYPE_TIME: {
		label: "Time",
		icon: ICON_TIME,
		color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
	},
	FIELD_TYPE_DURATION: {
		label: "Duration",
		icon: ICON_DURATION,
		color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
	},
	FIELD_TYPE_URL: {
		label: "URL",
		icon: ICON_URL,
		color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
	},
	FIELD_TYPE_JSON: {
		label: "JSON",
		icon: ICON_JSON,
		color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
	},
	FIELD_TYPE_NUMBER: {
		label: "Number",
		icon: ICON_NUMBER,
		color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
	},
	FIELD_TYPE_BOOL: {
		label: "Boolean",
		icon: ICON_BOOLEAN,
		color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
	},
};

/** Map a proto field type enum to a human-readable label. */
export function fieldTypeLabel(type: FieldType | undefined): string {
	if (!type) return "Unknown";
	return meta[type]?.label ?? type;
}

/** Get the short icon text for a field type. */
export function fieldTypeIcon(type: FieldType | undefined): string {
	if (!type) return ICON_UNKNOWN;
	return meta[type]?.icon ?? ICON_UNKNOWN;
}

/** Get the Tailwind color classes for a field type badge. */
export function fieldTypeColor(type: FieldType | undefined): string {
	if (!type) return meta.FIELD_TYPE_UNSPECIFIED.color;
	return meta[type]?.color ?? meta.FIELD_TYPE_UNSPECIFIED.color;
}
