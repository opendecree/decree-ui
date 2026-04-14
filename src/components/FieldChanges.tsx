import type { components } from "../api/schema";

type AuditEntry = components["schemas"]["v1AuditEntry"];

interface FieldChangesProps {
	entries: AuditEntry[];
}

/** Shows field-level deltas: field path, old → new value. Reusable across version history, rollback preview, and audit page. */
export function FieldChanges({ entries }: FieldChangesProps) {
	if (entries.length === 0) {
		return <p className="text-xs text-gray-400 dark:text-gray-500 italic">No changes</p>;
	}

	return (
		<div className="space-y-1.5">
			{entries.map((e) => (
				<div
					key={e.id ?? `${e.fieldPath}-${e.createdAt}`}
					className="flex items-baseline gap-2 text-xs"
				>
					<span className="font-mono text-gray-600 dark:text-gray-300">
						{e.fieldPath ?? e.action}
					</span>
					{e.oldValue !== undefined && (
						<>
							<span className="text-red-500 line-through">{truncate(e.oldValue)}</span>
							<span className="text-gray-400">→</span>
						</>
					)}
					{e.newValue !== undefined && (
						<span className="text-green-500">{truncate(e.newValue)}</span>
					)}
				</div>
			))}
		</div>
	);
}

/** Single audit entry row for the audit log table. */
export function AuditRow({ entry }: { entry: AuditEntry }) {
	const time = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";

	return (
		<tr className="border-b border-gray-100 dark:border-gray-800">
			<td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
				{time}
			</td>
			<td className="px-3 py-2 text-xs">{entry.actor}</td>
			<td className="px-3 py-2 text-xs">
				<ActionBadge action={entry.action} />
			</td>
			<td className="px-3 py-2 text-xs font-mono">{entry.fieldPath}</td>
			<td className="px-3 py-2 text-xs">
				{entry.oldValue !== undefined && (
					<span className="text-red-500 line-through">{truncate(entry.oldValue)}</span>
				)}
				{entry.oldValue !== undefined && entry.newValue !== undefined && (
					<span className="text-gray-400 mx-1">→</span>
				)}
				{entry.newValue !== undefined && (
					<span className="text-green-500">{truncate(entry.newValue)}</span>
				)}
			</td>
			<td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">v{entry.configVersion}</td>
		</tr>
	);
}

function ActionBadge({ action }: { action?: string }) {
	const colors: Record<string, string> = {
		set_field: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
		rollback: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
		import: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
	};
	const cls =
		colors[action ?? ""] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

	return (
		<span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
			{action ?? "unknown"}
		</span>
	);
}

function truncate(value: string, max = 40): string {
	return value.length > max ? `${value.slice(0, max)}…` : value;
}
