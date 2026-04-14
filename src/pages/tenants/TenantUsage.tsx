import { Link, useParams } from "react-router-dom";
import { useTenant, useTenantUsage } from "../../lib/hooks";
import { label } from "../../lib/labels";

/** Usage statistics page for a tenant — field read counts and last access. */
export function TenantUsage() {
	const { id } = useParams<{ id: string }>();
	const tid = id ?? "";
	const { data: tenantData } = useTenant(tid);
	const tenant = tenantData?.tenant;
	const { data, isLoading } = useTenantUsage(tid);
	const stats = data?.fieldStats ?? [];

	const sorted = [...stats].sort((a, b) => {
		const aCount = Number(a.readCount ?? "0");
		const bCount = Number(b.readCount ?? "0");
		return bCount - aCount;
	});

	const unused = sorted.filter((s) => Number(s.readCount ?? "0") === 0);
	const used = sorted.filter((s) => Number(s.readCount ?? "0") > 0);

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

			<h2 className="mb-4 text-xl font-semibold">Usage Stats — {tenant?.name}</h2>

			{isLoading && (
				<p className="text-sm text-gray-500 dark:text-gray-400">{label("common.loading")}</p>
			)}

			{!isLoading && stats.length === 0 && (
				<p className="text-sm text-gray-500 dark:text-gray-400">No usage data recorded yet.</p>
			)}

			{used.length > 0 && (
				<div className="mb-8">
					<h3 className="mb-3 text-sm font-medium text-gray-500 uppercase tracking-wide dark:text-gray-400">
						Active Fields
					</h3>
					<div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
						<table className="w-full text-left">
							<thead>
								<tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
									<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
										Field
									</th>
									<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
										Reads
									</th>
									<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
										Last Read By
									</th>
									<th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
										Last Read At
									</th>
								</tr>
							</thead>
							<tbody>
								{used.map((s) => (
									<tr key={s.fieldPath} className="border-b border-gray-100 dark:border-gray-800">
										<td className="px-3 py-2 text-sm font-mono">{s.fieldPath}</td>
										<td className="px-3 py-2 text-sm">{s.readCount}</td>
										<td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
											{s.lastReadBy ?? "—"}
										</td>
										<td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
											{s.lastReadAt ? new Date(s.lastReadAt).toLocaleString() : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{unused.length > 0 && (
				<div>
					<h3 className="mb-3 text-sm font-medium text-amber-600 uppercase tracking-wide dark:text-amber-400">
						Unused Fields ({unused.length})
					</h3>
					<div className="space-y-1">
						{unused.map((s) => (
							<div
								key={s.fieldPath}
								className="rounded border border-amber-200 bg-amber-50/30 px-3 py-2 text-sm font-mono dark:border-amber-900 dark:bg-amber-950/20"
							>
								{s.fieldPath}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
