import { describe, expect, it } from "vitest";
import type { components } from "../../api/schema";
import { buildFieldDiffs, changeTypeOf, predictReguard } from "../diff";

type AuditEntry = components["schemas"]["v1AuditEntry"];
type SchemaField = components["schemas"]["v1SchemaField"];

/** Build a path→field map from a flat field list (mirrors the screen's lookup). */
function fieldMap(fields: SchemaField[]): Map<string, SchemaField> {
	const m = new Map<string, SchemaField>();
	for (const f of fields) if (f.path) m.set(f.path, f);
	return m;
}

describe("changeTypeOf", () => {
	it("is 'added' when only a new value is present", () => {
		expect(changeTypeOf({ newValue: "3" })).toBe("added");
		expect(changeTypeOf({ oldValue: undefined, newValue: "x" })).toBe("added");
	});

	it("is 'removed' when only an old value is present", () => {
		expect(changeTypeOf({ oldValue: "3" })).toBe("removed");
		expect(changeTypeOf({ oldValue: "x", newValue: undefined })).toBe("removed");
	});

	it("is 'modified' when both old and new values are present", () => {
		expect(changeTypeOf({ oldValue: "1", newValue: "2" })).toBe("modified");
	});

	it("is 'modified' when neither side is present (defensive default)", () => {
		expect(changeTypeOf({})).toBe("modified");
	});

	it("treats null the same as undefined (a stored-null is not a value here)", () => {
		expect(changeTypeOf({ oldValue: null, newValue: "x" })).toBe("added");
		expect(changeTypeOf({ oldValue: "x", newValue: null })).toBe("removed");
	});
});

describe("buildFieldDiffs", () => {
	const fields = fieldMap([
		{ path: "app.name", type: "FIELD_TYPE_STRING" },
		{ path: "payments.retries", type: "FIELD_TYPE_INT" },
		{ path: "api.rate_limits", type: "FIELD_TYPE_JSON", sensitive: true },
	]);

	it("maps each field-mutating entry to a FieldDiff with the right change type", () => {
		const entries: AuditEntry[] = [
			{ fieldPath: "app.name", oldValue: "Old", newValue: "New" },
			{ fieldPath: "payments.retries", newValue: "3" },
		];
		const diffs = buildFieldDiffs(entries, fields);
		expect(diffs).toHaveLength(2);
		const name = diffs.find((d) => d.path === "app.name");
		expect(name).toMatchObject({ changeType: "modified", oldValue: "Old", newValue: "New" });
		const retries = diffs.find((d) => d.path === "payments.retries");
		expect(retries).toMatchObject({ changeType: "added", oldValue: null, newValue: "3" });
	});

	it("resolves sensitivity + field type from the schema by path", () => {
		const diffs = buildFieldDiffs([{ fieldPath: "api.rate_limits", newValue: "x" }], fields);
		expect(diffs[0]).toMatchObject({ sensitive: true, fieldType: "FIELD_TYPE_JSON" });
	});

	it("defaults sensitive=false and type=undefined for a path not in the schema", () => {
		const diffs = buildFieldDiffs([{ fieldPath: "ghost.field", newValue: "x" }], fields);
		expect(diffs[0].sensitive).toBe(false);
		expect(diffs[0].fieldType).toBeUndefined();
	});

	it("skips entries with no field path (e.g. rollback marker entries)", () => {
		const entries: AuditEntry[] = [
			{ action: "rollback", newValue: "v2" },
			{ fieldPath: "app.name", newValue: "New" },
		];
		const diffs = buildFieldDiffs(entries, fields);
		expect(diffs).toHaveLength(1);
		expect(diffs[0].path).toBe("app.name");
	});

	it("normalises a removed field to oldValue set / newValue null", () => {
		const diffs = buildFieldDiffs([{ fieldPath: "app.name", oldValue: "Gone" }], fields);
		expect(diffs[0]).toMatchObject({ changeType: "removed", oldValue: "Gone", newValue: null });
	});

	it("returns the diffs sorted by path for a stable render order", () => {
		const entries: AuditEntry[] = [
			{ fieldPath: "payments.retries", newValue: "3" },
			{ fieldPath: "api.rate_limits", newValue: "x" },
			{ fieldPath: "app.name", newValue: "n" },
		];
		const diffs = buildFieldDiffs(entries, fields);
		expect(diffs.map((d) => d.path)).toEqual(["api.rate_limits", "app.name", "payments.retries"]);
	});

	it("returns an empty array for no entries", () => {
		expect(buildFieldDiffs([], fields)).toEqual([]);
	});
});

describe("predictReguard", () => {
	const fields = fieldMap([
		{ path: "app.name", type: "FIELD_TYPE_STRING", constraints: { maxLength: 10 } },
		{ path: "payments.retries", type: "FIELD_TYPE_INT", constraints: { min: 0, max: 10 } },
		{ path: "payments.currency", type: "FIELD_TYPE_STRING", writeOnce: true },
		{ path: "app.version", type: "FIELD_TYPE_STRING", readOnly: true },
	]);
	const never = () => false;
	const always = () => true;

	it("returns no conflicts when every restored field is editable + valid", () => {
		const restored = new Map([["payments.retries", "5"]]);
		const conflicts = predictReguard("admin", restored, fields, new Set(), never);
		expect(conflicts).toEqual([]);
	});

	it("flags a locked field for an admin (lock blocks non-superadmin)", () => {
		const restored = new Map([["payments.retries", "5"]]);
		const conflicts = predictReguard(
			"admin",
			restored,
			fields,
			new Set(["payments.retries"]),
			never,
		);
		expect(conflicts).toEqual([{ path: "payments.retries", block: "locked" }]);
	});

	it("lets a superadmin bypass a lock (no conflict from the lock alone)", () => {
		const restored = new Map([["payments.retries", "5"]]);
		const conflicts = predictReguard(
			"superadmin",
			restored,
			fields,
			new Set(["payments.retries"]),
			never,
		);
		expect(conflicts).toEqual([]);
	});

	it("flags read-only even for a superadmin (absolute lock)", () => {
		const restored = new Map([["app.version", "9.9.9"]]);
		const conflicts = predictReguard("superadmin", restored, fields, new Set(), never);
		expect(conflicts).toEqual([{ path: "app.version", block: "read-only" }]);
	});

	it("flags write-once when the field currently holds a value — even for superadmin", () => {
		const restored = new Map([["payments.currency", "EUR"]]);
		const conflicts = predictReguard("superadmin", restored, fields, new Set(), always);
		expect(conflicts).toEqual([{ path: "payments.currency", block: "write-once" }]);
	});

	it("permits a write-once restore when the field is currently unset", () => {
		const restored = new Map([["payments.currency", "EUR"]]);
		const conflicts = predictReguard("admin", restored, fields, new Set(), never);
		expect(conflicts).toEqual([]);
	});

	it("flags 'role' for a user (no config-edit capability at all)", () => {
		const restored = new Map([["payments.retries", "5"]]);
		const conflicts = predictReguard("user", restored, fields, new Set(), never);
		expect(conflicts).toEqual([{ path: "payments.retries", block: "role" }]);
	});

	it("flags an 'invalid' restore when the value violates a current constraint", () => {
		const restored = new Map([["payments.retries", "999"]]);
		const conflicts = predictReguard("admin", restored, fields, new Set(), never);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].path).toBe("payments.retries");
		expect(conflicts[0].block).toBe("invalid");
		expect(conflicts[0].detail).toMatch(/maximum/i);
	});

	it("does not run validation once a field-level guard already blocks the field", () => {
		// read-only takes precedence: block is "read-only", not "invalid".
		const restored = new Map([["app.version", "x".repeat(50)]]);
		const conflicts = predictReguard("admin", restored, fields, new Set(), never);
		expect(conflicts).toEqual([{ path: "app.version", block: "read-only" }]);
	});

	it("skips a restored path that has no matching schema field", () => {
		const restored = new Map([["ghost.field", "x"]]);
		const conflicts = predictReguard("admin", restored, fields, new Set(), never);
		expect(conflicts).toEqual([]);
	});

	it("returns conflicts sorted by path", () => {
		const restored = new Map([
			["payments.retries", "999"],
			["app.version", "x"],
		]);
		const conflicts = predictReguard("admin", restored, fields, new Set(), never);
		expect(conflicts.map((c) => c.path)).toEqual(["app.version", "payments.retries"]);
	});
});
