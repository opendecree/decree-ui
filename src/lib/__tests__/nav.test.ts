import { describe, expect, it } from "vitest";
import { buildRail, resolveEntryPath } from "../nav";

const TENANT = "00000000-0000-0000-0000-000000000001";

describe("resolveEntryPath — role -> entry mapping", () => {
	describe("user", () => {
		it("lands on the pinned tenant's read view", () => {
			expect(resolveEntryPath("user", { tenantId: TENANT })).toBe(`/tenants/${TENANT}`);
		});
		it("falls back to the tenants list when no tenant is pinned", () => {
			expect(resolveEntryPath("user", {})).toBe("/tenants");
		});
	});

	describe("admin", () => {
		it("lands on the pinned tenant's config editor", () => {
			expect(resolveEntryPath("admin", { tenantId: TENANT })).toBe(`/tenants/${TENANT}`);
		});
		it("falls back to the tenants list when unpinned", () => {
			expect(resolveEntryPath("admin", {})).toBe("/tenants");
		});
	});

	describe("superadmin", () => {
		it("lands on the system-overview index route regardless of pins", () => {
			// The overview bypasses tenant scope, so a pin never narrows it.
			expect(resolveEntryPath("superadmin", {})).toBe("/");
			expect(resolveEntryPath("superadmin", { tenantId: TENANT })).toBe("/");
		});
	});
});

describe("buildRail — role -> rail model", () => {
	it("gives superadmin a global scope and the operate + author groups", () => {
		const rail = buildRail("superadmin", {});
		expect(rail.scope).toBe("global");
		const labels = rail.sections.flatMap((s) => s.items.map((i) => i.labelKey));
		expect(labels).toContain("nav.overview");
		expect(labels).toContain("nav.tenants");
		expect(labels).toContain("nav.schemas");
		expect(labels).not.toContain("nav.configEditor");
	});

	it("gives admin a tenant scope with the config-editor entry", () => {
		const rail = buildRail("admin", { tenantId: TENANT });
		expect(rail.scope).toBe("tenant");
		const items = rail.sections.flatMap((s) => s.items);
		expect(items.some((i) => i.labelKey === "nav.configEditor")).toBe(true);
		expect(items.some((i) => i.labelKey === "nav.history")).toBe(true);
		// admins never author schemas
		expect(items.some((i) => i.labelKey === "nav.schemas")).toBe(false);
	});

	it("gives user a tenant scope with the read-only values entry", () => {
		const rail = buildRail("user", { tenantId: TENANT });
		expect(rail.scope).toBe("tenant");
		const items = rail.sections.flatMap((s) => s.items);
		expect(items.some((i) => i.labelKey === "nav.values")).toBe(true);
		expect(items.some((i) => i.labelKey === "nav.configEditor")).toBe(false);
	});

	it("points tenant-scoped nav at the pinned tenant", () => {
		const rail = buildRail("admin", { tenantId: TENANT });
		const primary = rail.sections[0].items[0];
		expect(primary.to).toBe(`/tenants/${TENANT}`);
	});

	it("falls back to the tenants list when a tenant-scoped role has no pin", () => {
		const rail = buildRail("user", {});
		const primary = rail.sections[0].items[0];
		expect(primary.to).toBe("/tenants");
		// no per-tenant govern links without a tenant
		const labels = rail.sections.flatMap((s) => s.items.map((i) => i.labelKey));
		expect(labels).not.toContain("nav.auditLog");
	});
});
