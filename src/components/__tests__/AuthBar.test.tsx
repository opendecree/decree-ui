import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AuthState } from "../../lib/auth";
import { AuthContext } from "../../lib/auth";
import { AuthBar } from "../AuthBar";

function renderWithAuth(auth: AuthState = { subject: "admin", role: "superadmin" }) {
	return render(
		<AuthContext value={{ auth, setAuth: () => {} }}>
			<AuthBar />
		</AuthContext>,
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
});
