import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useSchemas, useTenants } from "../../lib/hooks";
import { label } from "../../lib/labels";
import { canManageTenants } from "../../lib/permissions";

/** Tenant list page with search, table, and create link. */
export function TenantList() {
	const { auth } = useAuth();
	const { data, isLoading, error } = useTenants();
	const { data: schemasData } = useSchemas();

	const schemaNames = useMemo(() => {
		const m = new Map<string, string>();
		for (const s of schemasData?.schemas ?? []) {
			if (s.id && s.name) m.set(s.id, s.name);
		}
		return m;
	}, [schemasData]);
	const [filter, setFilter] = useState("");

	const tenants = data?.tenants ?? [];
	const filtered = filter
		? tenants.filter((t) => t.name?.toLowerCase().includes(filter.toLowerCase()))
		: tenants;

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h2 className="text-xl font-semibold">{label("tenant.plural")}</h2>
				{canManageTenants(auth.role) && (
					<Link
						to="/tenants/create"
						className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{label("tenant.create")}
					</Link>
				)}
			</div>

			<div className="mb-4">
				<input
					type="text"
					placeholder={label("common.filter")}
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className="w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
				/>
			</div>

			{isLoading && <p className="text-gray-500 dark:text-gray-400">Loading tenants...</p>}

			{error && (
				<p className="text-red-600 dark:text-red-400">Error loading tenants: {error.message}</p>
			)}

			{!isLoading && !error && filtered.length === 0 && (
				<p className="text-gray-500 dark:text-gray-400">
					{filter ? label("tenant.noMatch") : label("tenant.noTenants")}
				</p>
			)}

			{filtered.length > 0 && (
				<div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
					<table className="w-full text-left text-sm">
						<thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
							<tr>
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Schema</th>
								<th className="px-4 py-3 font-medium">Schema Version</th>
								<th className="px-4 py-3 font-medium">Created</th>
							</tr>
						</thead>
						<tbody>
							{filtered.map((tenant) => (
								<tr
									key={tenant.id}
									className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
								>
									<td className="px-4 py-3">
										<Link
											to={`/tenants/${tenant.id}`}
											className="font-medium text-blue-600 hover:underline dark:text-blue-400"
										>
											{tenant.name}
										</Link>
									</td>
									<td className="px-4 py-3">
										{tenant.schemaId ? (
											<Link
												to={`/schemas/${tenant.schemaId}`}
												className="text-blue-600 hover:underline dark:text-blue-400"
											>
												{schemaNames.get(tenant.schemaId) ?? tenant.schemaId}
											</Link>
										) : (
											"-"
										)}
									</td>
									<td className="px-4 py-3">
										{tenant.schemaVersion ? `v${tenant.schemaVersion}` : "-"}
									</td>
									<td className="px-4 py-3 text-gray-500 dark:text-gray-400">
										{tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "-"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
