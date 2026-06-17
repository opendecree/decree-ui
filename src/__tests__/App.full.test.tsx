import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { STORAGE_KEY_AUTH } from "../lib/constants";

vi.mock("../lib/config", () => ({
	config: {
		layoutMode: "full",
		tenantId: undefined,
		appName: "Test",
		logoUrl: "",
		defaultRole: "",
		defaultSubject: "",
	},
}));

vi.mock("../pages/Home", () => ({ Home: () => <div data-testid="home" /> }));
vi.mock("../pages/NotFound", () => ({ NotFound: () => <div data-testid="not-found" /> }));
vi.mock("../pages/tenants/TenantConfig", () => ({
	TenantConfig: () => <div data-testid="tenant-config" />,
}));
vi.mock("../pages/schemas/SchemaDetail", () => ({ SchemaDetail: () => null }));
vi.mock("../pages/schemas/SchemaImport", () => ({ SchemaImport: () => null }));
vi.mock("../pages/schemas/SchemaList", () => ({ SchemaList: () => <div data-testid="schemas" /> }));
vi.mock("../pages/tenants/TenantAudit", () => ({ TenantAudit: () => null }));
vi.mock("../pages/tenants/TenantCreate", () => ({ TenantCreate: () => null }));
vi.mock("../pages/tenants/TenantHistory", () => ({ TenantHistory: () => null }));
vi.mock("../pages/tenants/TenantList", () => ({
	TenantList: () => <div data-testid="tenant-list" />,
}));
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

describe("App in full mode", () => {
	it("renders the role-first app shell (rail + role pill)", () => {
		renderApp();
		expect(screen.getByRole("navigation")).toBeInTheDocument();
	});

	it("lands superadmin on Home at / (interim overview entry)", () => {
		// No stored auth + no defaultRole => DEFAULT_ROLE superadmin.
		renderApp("/");
		expect(screen.getByTestId("home")).toBeInTheDocument();
	});

	it("routes an admin entry to the tenants list when no tenant is pinned", () => {
		localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify({ subject: "carol", role: "admin" }));
		renderApp("/");
		expect(screen.getByTestId("tenant-list")).toBeInTheDocument();
	});

	it("renders the config dispatcher for /tenants/:id", () => {
		renderApp("/tenants/00000000-0000-0000-0000-000000000001");
		expect(screen.getByTestId("tenant-config")).toBeInTheDocument();
	});

	it("renders NotFound for unknown routes", () => {
		renderApp("/unknown-route");
		expect(screen.getByTestId("not-found")).toBeInTheDocument();
	});
});
