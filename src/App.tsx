import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import type { AuthState } from "./lib/auth";
import { AuthContext, loadAuth, saveAuth } from "./lib/auth";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { SchemaDetail } from "./pages/schemas/SchemaDetail";
import { SchemaImport } from "./pages/schemas/SchemaImport";
import { SchemaList } from "./pages/schemas/SchemaList";
import { TenantCreate } from "./pages/tenants/TenantCreate";
import { TenantDetail } from "./pages/tenants/TenantDetail";
import { TenantList } from "./pages/tenants/TenantList";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
		},
	},
});

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
					<Route element={<Layout />}>
						<Route index element={<Home />} />
						<Route path="schemas" element={<SchemaList />} />
						<Route path="schemas/import" element={<SchemaImport />} />
						<Route path="schemas/:id" element={<SchemaDetail />} />
						<Route path="tenants" element={<TenantList />} />
						<Route path="tenants/create" element={<TenantCreate />} />
						<Route path="tenants/:id" element={<TenantDetail />} />
						<Route path="*" element={<NotFound />} />
					</Route>
				</Routes>
			</QueryClientProvider>
		</AuthContext>
	);
}
