import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAuth } from "../auth";
import { STORAGE_KEY_AUTH } from "../constants";

vi.mock("../config", () => ({
	config: {
		layoutMode: "config-only",
		defaultRole: "",
		defaultSubject: "",
		tenantId: undefined,
	},
}));

describe("loadAuth in config-only mode", () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		localStorage.clear();
	});

	it("defaults to admin role when no stored session", () => {
		const auth = loadAuth();
		expect(auth.role).toBe("admin");
	});

	it("caps stored superadmin role to admin", () => {
		localStorage.setItem(
			STORAGE_KEY_AUTH,
			JSON.stringify({ subject: "alice", role: "superadmin" }),
		);
		const auth = loadAuth();
		expect(auth.role).toBe("admin");
	});

	it("preserves stored admin role", () => {
		localStorage.setItem(
			STORAGE_KEY_AUTH,
			JSON.stringify({ subject: "alice", role: "admin", tenantId: "t-1" }),
		);
		const auth = loadAuth();
		expect(auth.role).toBe("admin");
		expect(auth.tenantId).toBe("t-1");
	});

	it("preserves stored user role", () => {
		localStorage.setItem(
			STORAGE_KEY_AUTH,
			JSON.stringify({ subject: "bob", role: "user", tenantId: "t-2" }),
		);
		const auth = loadAuth();
		expect(auth.role).toBe("user");
	});

	it("returns defaults on corrupt localStorage", () => {
		localStorage.setItem(STORAGE_KEY_AUTH, "not-json{{{");
		const auth = loadAuth();
		expect(auth.role).toBe("admin");
	});
});
