import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../lib/auth";
import { TenantDetail } from "../TenantDetail";

const TENANT_ID = "00000000-0000-0000-0000-000000000002";

vi.mock("../../../lib/config", () => ({
	config: {
		layoutMode: "full",
		tenantId: undefined,
		appName: "",
		logoUrl: "",
		defaultRole: "superadmin",
		defaultSubject: "admin",
	},
}));

vi.mock("../../../lib/hooks", () => ({
	useApiClient: () => ({}),
	useTenant: () => ({
		data: {
			tenant: {
				id: "00000000-0000-0000-0000-000000000002",
				name: "Test Corp",
				schemaId: "schema-2",
				schemaVersion: 1,
			},
		},
		isLoading: false,
		error: null,
	}),
	useSchemaVersion: () => ({
		data: {
			schema: {
				id: "schema-2",
				name: "Service Config",
				version: 1,
				fields: [
					{
						path: "service.name",
						title: "Service Name",
						description: "The name of the service",
						type: "FIELD_TYPE_STRING",
					},
					{
						path: "timeout",
						description: "Request timeout in seconds",
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
				<AuthContext value={{ auth: { subject: "admin", role: "superadmin" }, setAuth: () => {} }}>
					<Routes>
						<Route path="tenants/:id" element={<TenantDetail />} />
					</Routes>
				</AuthContext>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("TenantDetail — full mode (no productMode)", () => {
	it("renders the tenant name", () => {
		renderPage();
		expect(screen.getByText("Test Corp")).toBeInTheDocument();
	});

	it("renders field descriptions at small (text-xs) size", () => {
		const { container } = renderPage();
		const descriptions = container.querySelectorAll("p.text-xs.text-gray-500");
		expect(descriptions.length).toBeGreaterThan(0);
	});

	it("does not use prominent (text-sm text-gray-600) size for descriptions", () => {
		const { container } = renderPage();
		const prominentDesc = container.querySelectorAll("p.text-sm.text-gray-600");
		expect(prominentDesc.length).toBe(0);
	});

	it("renders type badges with per-type color (not neutral gray)", () => {
		const { container } = renderPage();
		const subtleBadges = container.querySelectorAll(".bg-gray-100.text-gray-400");
		expect(subtleBadges.length).toBe(0);
	});

	it("renders untitled field path as bold primary", () => {
		const { container } = renderPage();
		const boldPath = container.querySelector(".font-mono.font-medium");
		expect(boldPath).toBeInTheDocument();
	});

	it("shows Back to tenants link in full mode", () => {
		renderPage();
		expect(screen.getByText(/Back/)).toBeInTheDocument();
	});
});
