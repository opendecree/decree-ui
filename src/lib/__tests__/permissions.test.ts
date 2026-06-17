import { describe, expect, it } from "vitest";
import {
	canEditConfig,
	canEditField,
	canManageLocks,
	canManageSchemas,
	canManageTenants,
	fieldEditBlock,
} from "../permissions";

const editable = { readOnly: false, writeOnce: false };
const unset = { hasValue: false, isLocked: false };
const setAndLocked = { hasValue: true, isLocked: true };

describe("canEditConfig", () => {
	it("allows superadmin and admin, blocks user", () => {
		expect(canEditConfig("superadmin")).toBe(true);
		expect(canEditConfig("admin")).toBe(true);
		expect(canEditConfig("user")).toBe(false);
	});
});

describe("fieldEditBlock — guard-chain precedence", () => {
	it("blocks a non-editor role first with 'role'", () => {
		expect(fieldEditBlock("user", editable, setAndLocked)).toBe("role");
	});

	it("blocks a read-only field even for superadmin", () => {
		expect(fieldEditBlock("superadmin", { readOnly: true, writeOnce: false }, unset)).toBe(
			"read-only",
		);
	});

	it("blocks a write-once field that already has a value, even for superadmin", () => {
		expect(
			fieldEditBlock(
				"superadmin",
				{ readOnly: false, writeOnce: true },
				{ ...unset, hasValue: true },
			),
		).toBe("write-once");
	});

	it("allows a write-once field that has no value yet", () => {
		expect(fieldEditBlock("admin", { readOnly: false, writeOnce: true }, unset)).toBeNull();
	});

	it("blocks a locked field for an admin (non-superadmin)", () => {
		expect(fieldEditBlock("admin", editable, { hasValue: false, isLocked: true })).toBe("locked");
	});

	it("lets superadmin bypass a field lock", () => {
		expect(fieldEditBlock("superadmin", editable, { hasValue: false, isLocked: true })).toBeNull();
	});

	it("returns null when an editor faces no blocking condition", () => {
		expect(fieldEditBlock("admin", editable, unset)).toBeNull();
	});
});

describe("canEditField — convenience boolean", () => {
	it("is true when fieldEditBlock returns null", () => {
		expect(canEditField("admin", editable, unset)).toBe(true);
	});

	it("is false when any block applies (e.g. role)", () => {
		expect(canEditField("user", editable, unset)).toBe(false);
	});

	it("is false for a locked field as admin but true for superadmin", () => {
		const ctx = { hasValue: false, isLocked: true };
		expect(canEditField("admin", editable, ctx)).toBe(false);
		expect(canEditField("superadmin", editable, ctx)).toBe(true);
	});
});

describe("schema / tenant / lock management", () => {
	it("only superadmin manages schemas", () => {
		expect(canManageSchemas("superadmin")).toBe(true);
		expect(canManageSchemas("admin")).toBe(false);
		expect(canManageSchemas("user")).toBe(false);
	});

	it("only superadmin manages tenants", () => {
		expect(canManageTenants("superadmin")).toBe(true);
		expect(canManageTenants("admin")).toBe(false);
		expect(canManageTenants("user")).toBe(false);
	});

	it("superadmin and admin can manage locks, user cannot", () => {
		expect(canManageLocks("superadmin")).toBe(true);
		expect(canManageLocks("admin")).toBe(true);
		expect(canManageLocks("user")).toBe(false);
	});
});
