import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth";
import { ConfigOnlyLayout } from "../ConfigOnlyLayout";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock("../../lib/config", () => ({
	config: { layoutMode: "config-only", appName: "Test App", logoUrl: "" },
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
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuthContext value={{ auth: { subject: "admin", role: "admin" }, setAuth: () => {} }}>
					<ConfigOnlyLayout />
				</AuthContext>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("ConfigOnlyLayout", () => {
	it("renders app name in header", () => {
		renderLayout();
		expect(screen.getByText("Test App")).toBeInTheDocument();
	});

	it("renders dark mode toggle", () => {
		renderLayout();
		expect(screen.getByRole("button")).toBeInTheDocument();
	});

	it("renders no sidebar nav", () => {
		renderLayout();
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
	});
});
