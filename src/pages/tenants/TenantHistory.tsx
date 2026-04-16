import { Link, useParams } from "react-router-dom";
import { ConfigHistory } from "../../components/ConfigHistory";
import { useAuth } from "../../lib/auth";
import { config } from "../../lib/config";
import { useConfig, useTenant } from "../../lib/hooks";
import { label } from "../../lib/labels";

/** Standalone config history page for a tenant. */
export function TenantHistory() {
	const { id } = useParams<{ id: string }>();
	const tid = id ?? "";
	const { auth } = useAuth();
	const { data: tenantData } = useTenant(tid);
	const tenant = tenantData?.tenant;
	const { data: configData } = useConfig(tid);
	const currentVersion = configData?.config?.version;

	return (
		<div>
			{config.layoutMode !== "single-tenant" && (
				<div className="mb-6">
					<Link
						to={`/tenants/${tid}`}
						className="text-sm text-blue-600 hover:underline dark:text-blue-400"
					>
						&larr; {label("common.back")} to {tenant?.name ?? "tenant"}
					</Link>
				</div>
			)}

			<h2 className="mb-4 text-xl font-semibold">
				{label("config.history")} — {tenant?.name}
			</h2>

			<ConfigHistory tenantId={tid} currentVersion={currentVersion} role={auth.role} />
		</div>
	);
}
