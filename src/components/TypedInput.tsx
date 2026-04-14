import type { components } from "../api/schema";

type FieldType = components["schemas"]["v1FieldType"];
type FieldConstraints = components["schemas"]["v1FieldConstraints"];

export interface TypedInputProps {
	fieldPath: string;
	fieldType: FieldType | undefined;
	constraints: FieldConstraints | undefined;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

const baseInput =
	"w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
const disabledClass = "opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800";

/** Render a type-appropriate input for a schema field. */
export function TypedInput({
	fieldPath,
	fieldType,
	constraints,
	value,
	onChange,
	disabled,
}: TypedInputProps) {
	const cls = `${baseInput} ${disabled ? disabledClass : ""}`;

	// String with enum constraint -> dropdown
	if (fieldType === "FIELD_TYPE_STRING" && constraints?.enumValues?.length) {
		return (
			<select
				aria-label={fieldPath}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				className={cls}
			>
				<option value="">-- select --</option>
				{constraints.enumValues.map((v) => (
					<option key={v} value={v}>
						{v}
					</option>
				))}
			</select>
		);
	}

	switch (fieldType) {
		case "FIELD_TYPE_INT":
			return (
				<input
					aria-label={fieldPath}
					type="number"
					step="1"
					min={constraints?.min}
					max={constraints?.max}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={cls}
				/>
			);

		case "FIELD_TYPE_NUMBER":
			return (
				<input
					aria-label={fieldPath}
					type="number"
					min={constraints?.min}
					max={constraints?.max}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={cls}
				/>
			);

		case "FIELD_TYPE_BOOL":
			return (
				<label className="inline-flex cursor-pointer items-center gap-2">
					<input
						aria-label={fieldPath}
						type="checkbox"
						checked={value === "true"}
						onChange={(e) => onChange(e.target.checked ? "true" : "false")}
						disabled={disabled}
						className="sr-only peer"
					/>
					<span
						className={`relative h-6 w-11 rounded-full transition-colors ${
							value === "true" ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
						} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
					>
						<span
							className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
								value === "true" ? "translate-x-5" : ""
							}`}
						/>
					</span>
					<span className="text-sm text-gray-600 dark:text-gray-400">
						{value === "true" ? "true" : "false"}
					</span>
				</label>
			);

		case "FIELD_TYPE_DURATION":
			return (
				<input
					aria-label={fieldPath}
					type="text"
					placeholder="e.g., 30s, 1h"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={cls}
				/>
			);

		case "FIELD_TYPE_TIME":
			return (
				<input
					aria-label={fieldPath}
					type="datetime-local"
					value={toDatetimeLocal(value)}
					onChange={(e) => onChange(fromDatetimeLocal(e.target.value))}
					disabled={disabled}
					className={cls}
				/>
			);

		case "FIELD_TYPE_URL":
			return (
				<input
					aria-label={fieldPath}
					type="url"
					placeholder="https://example.com"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={cls}
				/>
			);

		case "FIELD_TYPE_JSON":
			return (
				<textarea
					aria-label={fieldPath}
					rows={3}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={`${cls} font-mono text-xs`}
				/>
			);

		default:
			// FIELD_TYPE_STRING and fallback
			return (
				<input
					aria-label={fieldPath}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={cls}
				/>
			);
	}
}

/** Convert an RFC 3339 timestamp to datetime-local input format. */
function toDatetimeLocal(rfc3339: string): string {
	if (!rfc3339) return "";
	try {
		const d = new Date(rfc3339);
		if (Number.isNaN(d.getTime())) return rfc3339;
		// yyyy-MM-ddTHH:mm
		return d.toISOString().slice(0, 16);
	} catch {
		return rfc3339;
	}
}

/** Convert a datetime-local input value back to RFC 3339. */
function fromDatetimeLocal(local: string): string {
	if (!local) return "";
	try {
		return new Date(local).toISOString();
	} catch {
		return local;
	}
}
