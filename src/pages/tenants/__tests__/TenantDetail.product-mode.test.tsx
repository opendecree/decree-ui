import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../lib/auth";
import { TenantDetail } from "../TenantDetail";

// Inline literal — vi.mock factory is hoisted, can't reference const from same file.
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

vi.mock("../../../lib/config", () => ({
	config: {
		layoutMode: "single-tenant",
		tenantId: "00000000-0000-0000-0000-000000000001",
		appName: "",
		logoUrl: "",
		defaultRole: "admin",
		defaultSubject: "admin",
	},
}));

vi.mock("../../../lib/hooks", () => ({
	useApiClient: () => ({}),
	useTenant: () => ({
		data: {
			tenant: {
				id: "00000000-0000-0000-0000-000000000001",
				name: "Acme Corp",
				schemaId: "schema-1",
				schemaVersion: 1,
			},
		},
		isLoading: false,
		error: null,
	}),
	useSchemaVersion: () => ({
		data: {
			schema: {
				id: "schema-1",
				name: "App Config",
				version: 1,
				fields: [
					{
						path: "app.name",
						title: "Application Name",
						description: "The display name of your application",
						type: "FIELD_TYPE_STRING",
					},
					{
						path: "max_retries",
						description: "Maximum number of retries",
						type: "FIELD_TYPE_INT",
					},
				],
			},
		},
		isLoading: false,
	}),
	useConfig: () => ({
		data: { config: { version: 1, values: [] } },
		isLoading: false,
	}),
	useFieldLocks: () => ({ data: { locks: [] } }),
	useAuditLog: () => ({ data: { entries: [] } }),
	useVersions: () => ({ data: { versions: [] } }),
}));

vi.mock("../../../components/ConfigHistory", () => ({
	ConfigHistory: () => null,
}));

beforeAll(() => {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi
			.fn()
			.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
	});
});

function renderPage() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={qc}>
			<MemoryRouter initialEntries={[`/tenants/${TENANT_ID}`]}>
				<AuthContext value={{ auth: { subject: "admin", role: "admin" }, setAuth: () => {} }}>
					<Routes>
						<Route path="tenants/:id" element={<TenantDetail />} />
					</Routes>
				</AuthContext>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("TenantDetail — single-tenant productMode", () => {
	it("renders the tenant name", () => {
		renderPage();
		expect(screen.getByText("Acme Corp")).toBeInTheDocument();
	});

	it("renders field descriptions at prominent (text-sm) size", () => {
		const { container } = renderPage();
		const descriptions = container.querySelectorAll("p.text-sm.text-gray-600");
		expect(descriptions.length).toBeGreaterThan(0);
	});

	it("does not use small (text-xs) size for descriptions", () => {
		const { container } = renderPage();
		const smallDesc = container.querySelectorAll("p.text-xs.text-gray-500");
		expect(smallDesc.length).toBe(0);
	});

	it("renders type badges with neutral gray (subtle) color", () => {
		const { container } = renderPage();
		const subtleBadges = container.querySelectorAll(".bg-gray-100.text-gray-400");
		expect(subtleBadges.length).toBeGreaterThan(0);
	});

	it("renders untitled field path as secondary (not bold)", () => {
		const { container } = renderPage();
		const pathSpan = container.querySelector(".font-mono.text-gray-500");
		expect(pathSpan).toBeInTheDocument();
	});

	it("does not show Back to tenants link", () => {
		renderPage();
		expect(screen.queryByText(/Back/)).not.toBeInTheDocument();
	});
});
