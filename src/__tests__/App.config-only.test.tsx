import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const TEST_TENANT_ID = "00000000-0000-0000-0000-000000000001";

vi.mock("../lib/config", () => ({
	config: {
		layoutMode: "config-only",
		tenantId: "00000000-0000-0000-0000-000000000001",
		appName: "Test",
		logoUrl: "",
		defaultRole: "",
		defaultSubject: "",
	},
}));

// Stub heavy page/component modules to keep the test lightweight.
vi.mock("../pages/tenants/TenantDetail", () => ({
	TenantDetail: () => <div data-testid="tenant-detail" />,
}));
vi.mock("../pages/Home", () => ({ Home: () => <div data-testid="home" /> }));
vi.mock("../pages/NotFound", () => ({ NotFound: () => <div data-testid="not-found" /> }));
vi.mock("../pages/schemas/SchemaDetail", () => ({ SchemaDetail: () => null }));
vi.mock("../pages/schemas/SchemaImport", () => ({ SchemaImport: () => null }));
vi.mock("../pages/schemas/SchemaList", () => ({ SchemaList: () => null }));
vi.mock("../pages/tenants/TenantAudit", () => ({ TenantAudit: () => null }));
vi.mock("../pages/tenants/TenantCreate", () => ({ TenantCreate: () => null }));
vi.mock("../pages/tenants/TenantHistory", () => ({ TenantHistory: () => null }));
vi.mock("../pages/tenants/TenantList", () => ({ TenantList: () => null }));
vi.mock("../pages/tenants/TenantUsage", () => ({ TenantUsage: () => null }));

beforeAll(() => {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi
			.fn()
			.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
	});
});

function renderApp(initialPath = "/") {
	return render(
		<MemoryRouter initialEntries={[initialPath]}>
			<App />
		</MemoryRouter>,
	);
}

describe("App in config-only mode", () => {
	it("renders ConfigOnlyLayout header (no sidebar nav)", () => {
		renderApp();
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
		expect(screen.getByRole("banner")).toBeInTheDocument();
	});

	it("redirects / to tenant detail when tenantId is set", () => {
		renderApp("/");
		expect(screen.getByTestId("tenant-detail")).toBeInTheDocument();
	});

	it("renders TenantDetail for /tenants/:id", () => {
		renderApp(`/tenants/${TEST_TENANT_ID}`);
		expect(screen.getByTestId("tenant-detail")).toBeInTheDocument();
	});

	it("renders NotFound for unknown routes", () => {
		renderApp("/schemas");
		expect(screen.getByTestId("not-found")).toBeInTheDocument();
	});
});
