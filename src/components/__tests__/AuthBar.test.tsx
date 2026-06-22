import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../lib/auth";
import { AuthContext } from "../../lib/auth";
import { AuthBar } from "../AuthBar";

vi.mock("../../lib/hooks", () => ({
	useApiClient: () => ({
		GET: async () => ({
			data: {
				tenants: [
					{ id: "t1-uuid", name: "tenant1" },
					{ id: "t2-uuid", name: "tenant2" },
				],
			},
		}),
	}),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderWithAuth(auth: AuthState = { subject: "admin", role: "superadmin" }) {
	return render(
		<QueryClientProvider client={queryClient}>
			<AuthContext value={{ auth, setAuth: () => {} }}>
				<AuthBar />
			</AuthContext>
		</QueryClientProvider>,
	);
}

describe("AuthBar", () => {
	it("renders subject input", () => {
		renderWithAuth();
		expect(screen.getByPlaceholderText("admin")).toBeInTheDocument();
	});

	it("renders role dropdown with all options", () => {
		renderWithAuth();
		const select = screen.getByRole("combobox");
		expect(select).toBeInTheDocument();
		expect(screen.getByText("superadmin")).toBeInTheDocument();
		expect(screen.getByText("admin")).toBeInTheDocument();
		expect(screen.getByText("user")).toBeInTheDocument();
	});

	it("shows current auth values", () => {
		renderWithAuth({ subject: "alice", role: "user" });
		const input = screen.getByDisplayValue("alice");
		expect(input).toBeInTheDocument();
	});

	it("suggests known tenants in the tenant combobox for a tenant-scoped role", async () => {
		renderWithAuth({ subject: "admin", role: "admin" });
		expect(await screen.findByText("tenant1 · t1-uuid")).toBeInTheDocument();
		expect(screen.getByText("tenant2 · t2-uuid")).toBeInTheDocument();
	});
});
