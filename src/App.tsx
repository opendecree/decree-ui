import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { EmbedLayout } from "./components/EmbedLayout";
import { Layout } from "./components/Layout";
import type { AuthState } from "./lib/auth";
import { AuthContext, loadAuth, saveAuth } from "./lib/auth";
import { config } from "./lib/config";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { SchemaDetail } from "./pages/schemas/SchemaDetail";
import { SchemaImport } from "./pages/schemas/SchemaImport";
import { SchemaList } from "./pages/schemas/SchemaList";
import { TenantAudit } from "./pages/tenants/TenantAudit";
import { TenantCreate } from "./pages/tenants/TenantCreate";
import { TenantDetail } from "./pages/tenants/TenantDetail";
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

/** In single-tenant mode, redirect home to the tenant detail page. */
function HomeOrRedirect() {
	if (config.layoutMode === "single-tenant" && config.tenantId) {
		return <Navigate to={`/tenants/${config.tenantId}`} replace />;
	}
	return <Home />;
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
				<Routes>
					{/* Standard layout with sidebar + header */}
					<Route element={<Layout />}>
						<Route index element={<HomeOrRedirect />} />
						<Route path="schemas" element={<SchemaList />} />
						<Route path="schemas/import" element={<SchemaImport />} />
						<Route path="schemas/:id" element={<SchemaDetail />} />
						<Route path="tenants" element={<TenantList />} />
						<Route path="tenants/create" element={<TenantCreate />} />
						<Route path="tenants/:id" element={<TenantDetail />} />
						<Route path="tenants/:id/audit" element={<TenantAudit />} />
						<Route path="tenants/:id/usage" element={<TenantUsage />} />
						<Route path="*" element={<NotFound />} />
					</Route>

					{/* Embed layout — no sidebar, no header, for iframe use */}
					<Route path="embed" element={<EmbedLayout />}>
						<Route path="tenants/:id" element={<TenantDetail />} />
						<Route path="tenants/:id/audit" element={<TenantAudit />} />
						<Route path="tenants/:id/usage" element={<TenantUsage />} />
						<Route path="schemas/:id" element={<SchemaDetail />} />
					</Route>
				</Routes>
			</QueryClientProvider>
		</AuthContext>
	);
}
