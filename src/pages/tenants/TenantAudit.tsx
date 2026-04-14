import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AuditRow } from "../../components/FieldChanges";
import { useAuditLog, useTenant } from "../../lib/hooks";
import { label } from "../../lib/labels";

/** Standalone audit log page for a tenant with filters. */
export function TenantAudit() {
	const { id } = useParams<{ id: string }>();
	const tid = id ?? "";
	const { data: tenantData } = useTenant(tid);
	const tenant = tenantData?.tenant;

	const [fieldFilter, setFieldFilter] = useState("");
	const [actorFilter, setActorFilter] = useState("");

	const filters = {
		...(fieldFilter ? { fieldPath: fieldFilter } : {}),
		...(actorFilter ? { actor: actorFilter } : {}),
	};

	const { data, isLoading } = useAuditLog(
		tid,
		Object.keys(filters).length > 0 ? filters : undefined,
	);
	const entries = data?.entries ?? [];

	return (
		<div>
			<div className="mb-6">
				<Link
					to={`/tenants/${tid}`}
					className="text-sm text-blue-600 hover:underline dark:text-blue-400"
				>
					&larr; {label("common.back")} to {tenant?.name ?? "tenant"}
				</Link>
			</div>

			<h2 className="mb-4 text-xl font-semibold">Audit Log — {tenant?.name}</h2>

			<div className="mb-4 flex gap-3">
				<input
					type="text"
					placeholder="Filter by field path..."
					value={fieldFilter}
					onChange={(e) => setFieldFilter(e.target.value)}
					className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
				/>
				<input
					type="text"
					placeholder="Filter by actor..."
					value={actorFilter}
					onChange={(e) => setActorFilter(e.target.value)}
					className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
				/>
			</div>

			{isLoading && (
				<p className="text-sm text-gray-500 dark:text-gray-400">{label("common.loading")}</p>
			)}

			{!isLoading && entries.length === 0 && (
				<p className="text-sm text-gray-500 dark:text-gray-400">No audit entries found.</p>
			)}

			{entries.length > 0 && (
				<div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
					<table className="w-full text-left">
						<thead>
							<tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
								<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
									Time
								</th>
								<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
									Actor
								</th>
								<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
									Action
								</th>
								<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
									Field
								</th>
								<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
									Change
								</th>
								<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
									Version
								</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => (
								<AuditRow key={entry.id} entry={entry} />
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
