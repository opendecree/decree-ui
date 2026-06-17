import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ConfigOnlyLayout } from "./components/ConfigOnlyLayout";
import { EmbedLayout } from "./components/EmbedLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { AuthState } from "./lib/auth";
import { AuthContext, loadAuth, saveAuth } from "./lib/auth";
import { config } from "./lib/config";
import { resolveEntryPath } from "./lib/nav";
import { ToastProvider } from "./lib/toast";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { SchemaDetail } from "./pages/schemas/SchemaDetail";
import { SchemaImport } from "./pages/schemas/SchemaImport";
import { SchemaList } from "./pages/schemas/SchemaList";
import { TenantAudit } from "./pages/tenants/TenantAudit";
import { TenantConfig } from "./pages/tenants/TenantConfig";
import { TenantCreate } from "./pages/tenants/TenantCreate";
import { TenantHistory } from "./pages/tenants/TenantHistory";
import { TenantList } from "./pages/tenants/TenantList";
import { TenantUsage } from "./pages/tenants/TenantUsage";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
		},
	},
});

/**
 * Role-first entry point. The landing destination is derived from the caller's
 * role (read view / config editor / system overview) rather than a fixed home,
 * with the deployment pins (tenantId) narrowing the target. superadmin falls
 * through to Home until the overview screen lands (TODO(#91)).
 */
function RoleEntry({ auth }: { auth: AuthState }) {
	const target = resolveEntryPath(auth.role, { tenantId: config.tenantId || auth.tenantId });
	if (target === "/") {
		// TODO(#91): superadmin overview entry — render the system-overview screen
		// here instead of Home once it exists.
		return <Home />;
	}
	return <Navigate to={target} replace />;
}

export function App() {
	const [auth, setAuthState] = useState<AuthState>(loadAuth);

	const setAuth = (next: AuthState) => {
		setAuthState(next);
		saveAuth(next);
	};

	return (
		<AuthContext value={{ auth, setAuth }}>
			<QueryClientProvider client={queryClient}>
				<ToastProvider>
					<ErrorBoundary>
						<Routes>
							{config.layoutMode === "config-only" ? (
								/* config-only: brand topbar, no rail. The role dispatcher (TenantConfig)
								   renders the editor for admins and the read view for read-only roles. */
								<Route element={<ConfigOnlyLayout />}>
									<Route index element={<RoleEntry auth={auth} />} />
									<Route path="tenants/:id" element={<TenantConfig />} />
									<Route path="*" element={<NotFound />} />
								</Route>
							) : (
								<>
									{/* Role-first app shell: tokenized rail + topbar. */}
									<Route element={<AppShell />}>
										<Route index element={<RoleEntry auth={auth} />} />
										<Route path="schemas" element={<SchemaList />} />
										<Route path="schemas/import" element={<SchemaImport />} />
										<Route path="schemas/:id" element={<SchemaDetail />} />
										<Route path="tenants" element={<TenantList />} />
										<Route path="tenants/create" element={<TenantCreate />} />
										<Route path="tenants/:id" element={<TenantConfig />} />
										<Route path="tenants/:id/history" element={<TenantHistory />} />
										<Route path="tenants/:id/audit" element={<TenantAudit />} />
										<Route path="tenants/:id/usage" element={<TenantUsage />} />
										<Route path="*" element={<NotFound />} />
									</Route>

									{/* embed route — no chrome, for iframe use. Dispatches by role
									    via TenantConfig, same as the in-app config screen. */}
									<Route path="embed" element={<EmbedLayout />}>
										<Route path="tenants/:id" element={<TenantConfig />} />
										<Route path="tenants/:id/audit" element={<TenantAudit />} />
										<Route path="tenants/:id/usage" element={<TenantUsage />} />
										<Route path="schemas/:id" element={<SchemaDetail />} />
									</Route>
								</>
							)}
						</Routes>
					</ErrorBoundary>
				</ToastProvider>
			</QueryClientProvider>
		</AuthContext>
	);
}
