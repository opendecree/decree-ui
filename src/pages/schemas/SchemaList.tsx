import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useSchemas } from "../../lib/hooks";
import { label } from "../../lib/labels";
import { canManageSchemas } from "../../lib/permissions";

/** Schema list page with search, table, and import link. */
export function SchemaList() {
	const { auth } = useAuth();
	const { data, isLoading, error } = useSchemas();
	const [filter, setFilter] = useState("");

	const schemas = data?.schemas ?? [];
	const filtered = filter
		? schemas.filter((s) => s.name?.toLowerCase().includes(filter.toLowerCase()))
		: schemas;

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h2 className="text-xl font-semibold">{label("schema.plural")}</h2>
				{canManageSchemas(auth.role) && (
					<Link
						to="/schemas/import"
						className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{label("schema.import")}
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

			{isLoading && <p className="text-gray-500 dark:text-gray-400">Loading schemas...</p>}

			{error && (
				<p className="text-red-600 dark:text-red-400">Error loading schemas: {error.message}</p>
			)}

			{!isLoading && !error && filtered.length === 0 && (
				<p className="text-gray-500 dark:text-gray-400">
					{filter ? label("schema.noMatch") : label("schema.noSchemas")}
				</p>
			)}

			{filtered.length > 0 && (
				<div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
					<table className="w-full text-left text-sm">
						<thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
							<tr>
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Version</th>
								<th className="px-4 py-3 font-medium">Published</th>
								<th className="px-4 py-3 font-medium">Fields</th>
								<th className="px-4 py-3 font-medium">Created</th>
							</tr>
						</thead>
						<tbody>
							{filtered.map((schema) => (
								<tr
									key={schema.id}
									className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
								>
									<td className="px-4 py-3">
										<Link
											to={`/schemas/${schema.id}`}
											className="font-medium text-blue-600 hover:underline dark:text-blue-400"
										>
											{schema.name}
										</Link>
									</td>
									<td className="px-4 py-3">v{schema.version}</td>
									<td className="px-4 py-3">
										<StatusBadge published={schema.published} />
									</td>
									<td className="px-4 py-3">{schema.fields?.length ?? 0}</td>
									<td className="px-4 py-3 text-gray-500 dark:text-gray-400">
										{schema.createdAt ? new Date(schema.createdAt).toLocaleDateString() : "-"}
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

function StatusBadge({ published }: { published?: boolean }) {
	if (published) {
		return (
			<span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
				{label("schema.statusPublished")}
			</span>
		);
	}
	return (
		<span className="inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
			{label("schema.statusDraft")}
		</span>
	);
}
