import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth";
import { Layout } from "../Layout";

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

function renderLayout() {
	return render(
		<MemoryRouter>
			<AuthContext value={{ auth: { subject: "admin", role: "superadmin" }, setAuth: () => {} }}>
				<Layout />
			</AuthContext>
		</MemoryRouter>,
	);
}

describe("Layout — full mode", () => {
	it("renders sidebar navigation", () => {
		renderLayout();
		expect(screen.getByRole("navigation")).toBeInTheDocument();
	});

	it("shows Home nav link", () => {
		renderLayout();
		expect(screen.getByText("Home")).toBeInTheDocument();
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
