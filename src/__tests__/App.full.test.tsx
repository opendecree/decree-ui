import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../App";

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
vi.mock("../pages/tenants/TenantDetail", () => ({
	TenantDetail: () => <div data-testid="tenant-detail" />,
}));
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

describe("App in full mode", () => {
	it("renders sidebar navigation", () => {
		renderApp();
		expect(screen.getByRole("navigation")).toBeInTheDocument();
	});

	it("renders Home at /", () => {
		renderApp("/");
		expect(screen.getByTestId("home")).toBeInTheDocument();
	});

	it("renders NotFound for unknown routes", () => {
		renderApp("/unknown-route");
		expect(screen.getByTestId("not-found")).toBeInTheDocument();
	});
});
