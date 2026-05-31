import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth";
import { Layout } from "../Layout";

vi.mock("../../lib/config", () => ({
	config: {
		layoutMode: "single-tenant",
		tenantId: "00000000-0000-0000-0000-000000000001",
		appName: "Test App",
		logoUrl: "",
	},
}));

beforeAll(() => {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi
			.fn()
			.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
	});
});

function renderLayout() {
	return render(
		<MemoryRouter>
			<AuthContext
				value={{
					auth: {
						subject: "admin",
						role: "admin",
						tenantId: "00000000-0000-0000-0000-000000000001",
					},
					setAuth: () => {},
				}}
			>
				<Layout />
			</AuthContext>
		</MemoryRouter>,
	);
}

describe("Layout — single-tenant mode", () => {
	it("renders sidebar navigation", () => {
		renderLayout();
		expect(screen.getByRole("navigation")).toBeInTheDocument();
	});

	it("does not show Home nav link", () => {
		renderLayout();
		expect(screen.queryByText("Home")).not.toBeInTheDocument();
	});

	it("shows Configuration nav item", () => {
		renderLayout();
		expect(screen.getByText("Configuration")).toBeInTheDocument();
	});

	it("shows History nav item", () => {
		renderLayout();
		expect(screen.getByText("History")).toBeInTheDocument();
	});

	it("shows Audit Log nav item", () => {
		renderLayout();
		expect(screen.getByText("Audit Log")).toBeInTheDocument();
	});

	it("shows Usage nav item", () => {
		renderLayout();
		expect(screen.getByText("Usage")).toBeInTheDocument();
	});

	it("renders footer with version number", () => {
		renderLayout();
		expect(screen.getByText(/^v\d/)).toBeInTheDocument();
	});

	it("renders footer Docs link", () => {
		renderLayout();
		expect(screen.getByRole("link", { name: "Docs" })).toBeInTheDocument();
	});

	it("renders footer Powered by OpenDecree link", () => {
		renderLayout();
		expect(screen.getByRole("link", { name: "OpenDecree" })).toBeInTheDocument();
	});
});
