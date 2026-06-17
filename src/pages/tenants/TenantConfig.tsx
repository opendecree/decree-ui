import { useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { canEditConfig } from "../../lib/permissions";
import { ReadView } from "../ReadView";
import { ConfigEditor } from "./ConfigEditor";

/**
 * Role dispatch for a tenant's config at /tenants/:id. Editors (admin, superadmin)
 * get the full tokenized config editor; read-only roles (user) get the read view.
 * Rendering one component or the other — rather than branching inside one component
 * — keeps hook order stable when the active role changes (e.g. via the debug auth
 * bar). Used by the app shell, config-only, and embed routes alike.
 */
export function TenantConfig() {
	const { id } = useParams<{ id: string }>();
	const { auth } = useAuth();
	const tenantId = id ?? "";
	return canEditConfig(auth.role) ? (
		<ConfigEditor tenantId={tenantId} />
	) : (
		<ReadView tenantId={tenantId} />
	);
}
