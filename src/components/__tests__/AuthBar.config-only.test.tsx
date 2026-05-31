import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../lib/auth";
import { AuthContext } from "../../lib/auth";
import { AuthBar } from "../AuthBar";

vi.mock("../../lib/config", () => ({
	config: { layoutMode: "config-only" },
}));

function renderWithAuth(auth: AuthState = { subject: "admin", role: "admin" }) {
	return render(
		<AuthContext value={{ auth, setAuth: () => {} }}>
			<AuthBar />
		</AuthContext>,
	);
}

describe("AuthBar in config-only mode", () => {
	it("excludes superadmin from role dropdown", () => {
		renderWithAuth();
		expect(screen.queryByText("superadmin")).not.toBeInTheDocument();
		expect(screen.getByText("admin")).toBeInTheDocument();
		expect(screen.getByText("user")).toBeInTheDocument();
	});
});
