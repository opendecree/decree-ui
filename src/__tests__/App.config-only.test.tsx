import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { STORAGE_KEY_AUTH } from "../lib/constants";

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

// The config-only route dispatches through TenantConfig (the role dispatcher),
// which picks TenantDetail for editors and ReadView for read-only roles.
vi.mock("../pages/tenants/TenantDetail", () => ({
	TenantDetail: () => <div data-testid="tenant-detail" />,
}));
vi.mock("../pages/ReadView", () => ({
	ReadView: () => <div data-testid="read-view" />,
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

beforeEach(() => {
	localStorage.clear();
});

function renderApp(initialPath = "/") {
	return render(
		<MemoryRouter initialEntries={[initialPath]}>
			<App />
		</MemoryRouter>,
	);
}

describe("App in config-only mode", () => {
	it("renders the config-only topbar (no rail nav)", () => {
		renderApp();
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
		expect(screen.getByRole("banner")).toBeInTheDocument();
	});

	it("routes the entry to the pinned tenant (dispatched to the editor for admin)", () => {
		// config-only default role is admin -> TenantConfig renders TenantDetail.
		renderApp("/");
		expect(screen.getByTestId("tenant-detail")).toBeInTheDocument();
	});

	it("dispatches /tenants/:id to the editor for an admin", () => {
		renderApp(`/tenants/${TEST_TENANT_ID}`);
		expect(screen.getByTestId("tenant-detail")).toBeInTheDocument();
	});

	it("dispatches /tenants/:id to the read view for a read-only user", () => {
		localStorage.setItem(
			STORAGE_KEY_AUTH,
			JSON.stringify({ subject: "dave", role: "user", tenantId: TEST_TENANT_ID }),
		);
		renderApp(`/tenants/${TEST_TENANT_ID}`);
		expect(screen.getByTestId("read-view")).toBeInTheDocument();
	});

	it("renders NotFound for unknown routes", () => {
		renderApp("/schemas");
		expect(screen.getByTestId("not-found")).toBeInTheDocument();
	});
});
