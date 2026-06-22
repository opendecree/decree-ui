import { useQuery } from "@tanstack/react-query";
import type { AuthState } from "../lib/auth";
import { useAuth } from "../lib/auth";
import { config } from "../lib/config";
import { DEFAULT_SUBJECT, ROLES, type Role } from "../lib/constants";
import { useApiClient } from "../lib/hooks";
import { label } from "../lib/labels";

/** Dev-mode auth controls — subject, role, and a tenant combobox. */
export function AuthBar() {
	const { auth, setAuth } = useAuth();
	const client = useApiClient();

	// Suggest known tenants when the current identity is allowed to list them
	// (shares the cache with the tenant list page). Falls back silently to free
	// text otherwise — e.g. as a non-superadmin, where listing returns 403 — so
	// you can still type an arbitrary name or UUID to test access.
	const { data: tenantsData } = useQuery({
		queryKey: ["tenants"],
		queryFn: async () => {
			const { data } = await client.GET("/v1/tenants");
			return data ?? { tenants: [] };
		},
		retry: false,
		staleTime: 30_000,
	});
	const tenantSuggestions = tenantsData?.tenants ?? [];

	const update = (patch: Partial<AuthState>) => {
		setAuth({ ...auth, ...patch });
	};

	const availableRoles =
		config.layoutMode === "config-only" ? ROLES.filter((r) => r !== "superadmin") : ROLES;
	const needsTenant = auth.role !== "superadmin";

	return (
		<div className="flex items-center gap-3 rounded-md border border-dashed border-warn/40 bg-warn-soft px-3 py-1.5 text-sm">
			<span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-warn">
				Debug
			</span>
			<label className="flex items-center gap-1.5">
				<span className="text-fg-2">{label("auth.subject")}</span>
				<input
					type="text"
					value={auth.subject}
					onChange={(e) => update({ subject: e.target.value })}
					className="rounded-sm border border-line bg-transparent px-2 py-1 text-fg"
					placeholder={DEFAULT_SUBJECT}
				/>
			</label>
			<label className="flex items-center gap-1.5">
				<span className="text-fg-2">{label("auth.role")}</span>
				<select
					value={auth.role}
					onChange={(e) => {
						const role = e.target.value as Role;
						if (role === "superadmin") {
							update({ role, tenantId: undefined });
						} else {
							update({ role });
						}
					}}
					className="rounded-sm border border-line bg-surface px-2 py-1 text-fg"
				>
					{availableRoles.map((role) => (
						<option key={role} value={role}>
							{role}
						</option>
					))}
				</select>
			</label>
			{needsTenant && (
				<label className="flex items-center gap-1.5">
					<span className="text-fg-2">{label("auth.tenantId")}</span>
					<input
						type="text"
						list="auth-tenant-options"
						value={auth.tenantId ?? ""}
						onChange={(e) => update({ tenantId: e.target.value || undefined })}
						className={`w-72 rounded-sm border px-2 py-1 font-mono text-xs ${
							auth.tenantId
								? "border-line bg-transparent text-fg"
								: "border-warn/60 bg-warn-soft text-fg"
						}`}
						placeholder="select a tenant or type a name / UUID..."
					/>
					<datalist id="auth-tenant-options">
						{tenantSuggestions.map((t) => (
							<option key={t.id} value={t.name ?? t.id}>
								{t.name ? `${t.name} · ${t.id}` : t.id}
							</option>
						))}
					</datalist>
				</label>
			)}
		</div>
	);
}
