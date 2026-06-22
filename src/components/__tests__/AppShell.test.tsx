import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../lib/auth";
import { AuthContext } from "../../lib/auth";
import { AppShell } from "../AppShell";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock("../../lib/config", () => ({
	config: { layoutMode: "full", appName: "Test App", logoUrl: "" },
}));

beforeAll(() => {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi
			.fn()
			.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
	});
});

function renderShell(auth: AuthState) {
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuthContext value={{ auth, setAuth: () => {} }}>
					<AppShell />
				</AuthContext>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

const TENANT = "00000000-0000-0000-0000-000000000001";

describe("AppShell — role-first rail", () => {
	it("renders rail navigation and the role pill", () => {
		renderShell({ subject: "admin", role: "superadmin" });
		expect(screen.getByRole("navigation")).toBeInTheDocument();
		// role pill lives in the topbar (banner) — a <span>, distinct from the
		// AuthBar role-select <option> with the same text.
		const banner = screen.getByRole("banner");
		const pill = within(banner).getByText(
			(_, el) => el?.tagName === "SPAN" && el.textContent === "superadmin",
		);
		expect(pill).toBeInTheDocument();
	});

	describe("superadmin", () => {
		it("shows the operate + author nav (overview, tenants, schemas)", () => {
			renderShell({ subject: "admin", role: "superadmin" });
			const nav = screen.getByRole("navigation");
			expect(within(nav).getByText("System overview")).toBeInTheDocument();
			expect(within(nav).getByText("Tenants")).toBeInTheDocument();
			expect(within(nav).getByText("Schemas")).toBeInTheDocument();
		});

		it("shows an All-tenants scope (no single-tenant scope)", () => {
			renderShell({ subject: "admin", role: "superadmin" });
			expect(screen.getByText("All tenants")).toBeInTheDocument();
		});

		it("does not show the config editor or values entry", () => {
			renderShell({ subject: "admin", role: "superadmin" });
			const nav = screen.getByRole("navigation");
			expect(within(nav).queryByText("Config editor")).not.toBeInTheDocument();
			expect(within(nav).queryByText("Values")).not.toBeInTheDocument();
		});
	});

	describe("admin", () => {
		it("shows the config editor entry and the tenant scope", () => {
			renderShell({ subject: "carol", role: "admin", tenantId: TENANT });
			const nav = screen.getByRole("navigation");
			expect(within(nav).getByText("Config editor")).toBeInTheDocument();
			expect(within(nav).getByText("History")).toBeInTheDocument();
			expect(screen.getByText(TENANT)).toBeInTheDocument();
		});

		it("does not show schema authoring or system overview", () => {
			renderShell({ subject: "carol", role: "admin", tenantId: TENANT });
			const nav = screen.getByRole("navigation");
			expect(within(nav).queryByText("Schemas")).not.toBeInTheDocument();
			expect(within(nav).queryByText("System overview")).not.toBeInTheDocument();
		});
	});

	describe("user", () => {
		it("shows the read-only values entry, not the editor", () => {
			renderShell({ subject: "dave", role: "user", tenantId: TENANT });
			const nav = screen.getByRole("navigation");
			expect(within(nav).getByText("Values")).toBeInTheDocument();
			expect(within(nav).queryByText("Config editor")).not.toBeInTheDocument();
		});
	});

	it("renders the footer with the version", () => {
		renderShell({ subject: "admin", role: "superadmin" });
		expect(screen.getByText(/^decree v\d/)).toBeInTheDocument();
	});
});
