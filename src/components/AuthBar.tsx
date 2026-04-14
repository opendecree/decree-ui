import type { AuthState } from "../lib/auth";
import { useAuth } from "../lib/auth";
import { DEFAULT_SUBJECT, ROLES, type Role } from "../lib/constants";
import { label } from "../lib/labels";

/** Dev-mode auth controls — subject, role, tenant ID (text input for non-superadmin). */
export function AuthBar() {
	const { auth, setAuth } = useAuth();

	const update = (patch: Partial<AuthState>) => {
		setAuth({ ...auth, ...patch });
	};

	const needsTenant = auth.role !== "superadmin";

	return (
		<div className="flex items-center gap-3 text-sm">
			<label className="flex items-center gap-1.5">
				<span className="text-gray-500 dark:text-gray-400">{label("auth.subject")}</span>
				<input
					type="text"
					value={auth.subject}
					onChange={(e) => update({ subject: e.target.value })}
					className="rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-600"
					placeholder={DEFAULT_SUBJECT}
				/>
			</label>
			<label className="flex items-center gap-1.5">
				<span className="text-gray-500 dark:text-gray-400">{label("auth.role")}</span>
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
					className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				>
					{ROLES.map((role) => (
						<option key={role} value={role}>
							{role}
						</option>
					))}
				</select>
			</label>
			{needsTenant && (
				<label className="flex items-center gap-1.5">
					<span className="text-gray-500 dark:text-gray-400">{label("auth.tenantId")}</span>
					<input
						type="text"
						value={auth.tenantId ?? ""}
						onChange={(e) => update({ tenantId: e.target.value || undefined })}
						className={`w-72 rounded border px-2 py-1 font-mono text-xs ${
							!auth.tenantId
								? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950"
								: "border-gray-300 bg-transparent dark:border-gray-600"
						}`}
						placeholder="paste tenant UUID..."
					/>
				</label>
			)}
		</div>
	);
}
