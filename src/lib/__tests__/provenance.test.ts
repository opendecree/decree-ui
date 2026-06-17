import { describe, expect, it } from "vitest";
import type { components } from "../../api/schema";
import { latestEntryForField, resolveFieldProvenance } from "../provenance";

type AuditEntry = components["schemas"]["v1AuditEntry"];

describe("resolveFieldProvenance — set fields", () => {
	it("classifies a field that holds a value as 'set', carrying latest provenance", () => {
		const entries: AuditEntry[] = [
			{
				fieldPath: "payments.fee_rate",
				oldValue: "1.0",
				newValue: "2.5",
				actor: "carol@acme",
				createdAt: "2026-06-15T10:00:00Z",
				configVersion: 7,
			},
		];
		const p = resolveFieldProvenance("payments.fee_rate", true, entries);
		expect(p.state).toBe("set");
		expect(p.actor).toBe("carol@acme");
		expect(p.version).toBe(7);
		expect(p.time).toBe("2026-06-15T10:00:00Z");
	});

	it("is 'set' even with no audit history (value present, provenance unknown)", () => {
		const p = resolveFieldProvenance("a.b", true, []);
		expect(p.state).toBe("set");
		expect(p.actor).toBeUndefined();
		expect(p.version).toBeUndefined();
	});
});

describe("resolveFieldProvenance — explicit null vs unset", () => {
	it("classifies a never-set field (no entries) as 'unset' → default applies", () => {
		const p = resolveFieldProvenance("settlement.cutoff_time", false, []);
		expect(p.state).toBe("unset");
		// Unset carries no provenance — it resolves to the schema default.
		expect(p.actor).toBeUndefined();
		expect(p.version).toBeUndefined();
	});

	it("classifies a deliberate clear (had old, empty new) as 'explicit-null'", () => {
		const entries: AuditEntry[] = [
			{
				fieldPath: "settlement.cutoff_time",
				oldValue: "2025-01-15T09:30:00Z",
				newValue: "",
				actor: "bob@acme",
				configVersion: 7,
			},
		];
		const p = resolveFieldProvenance("settlement.cutoff_time", false, entries);
		expect(p.state).toBe("explicit-null");
		expect(p.actor).toBe("bob@acme");
		expect(p.version).toBe(7);
	});

	it("treats a missing (undefined) new value with a prior value as a clear", () => {
		const entries: AuditEntry[] = [
			{ fieldPath: "f", oldValue: "x", actor: "a@b", configVersion: 3 },
		];
		expect(resolveFieldProvenance("f", false, entries).state).toBe("explicit-null");
	});

	it("honours an explicit clear/unset action name even without an old value", () => {
		const cleared: AuditEntry[] = [{ fieldPath: "f", action: "clear_field", actor: "a@b" }];
		expect(resolveFieldProvenance("f", false, cleared).state).toBe("explicit-null");
		const unset: AuditEntry[] = [{ fieldPath: "f", action: "unset_field", actor: "a@b" }];
		expect(resolveFieldProvenance("f", false, unset).state).toBe("explicit-null");
	});

	it("does NOT treat an add (no old, has new) as a clear when the value is now empty", () => {
		// A field that was added (no prior value) and is currently empty with no
		// clearing entry resolves to unset, not explicit-null.
		const entries: AuditEntry[] = [
			{ fieldPath: "f", newValue: "", actor: "a@b", configVersion: 2 },
		];
		expect(resolveFieldProvenance("f", false, entries).state).toBe("unset");
	});
});

describe("latestEntryForField — ordering", () => {
	it("returns the first matching entry in newest-first input order", () => {
		const entries: AuditEntry[] = [
			{ fieldPath: "f", newValue: "newest", configVersion: 9 },
			{ fieldPath: "f", newValue: "older", configVersion: 5 },
			{ fieldPath: "other", newValue: "x", configVersion: 99 },
		];
		expect(latestEntryForField(entries, "f")?.newValue).toBe("newest");
	});

	it("prefers the higher config version when entries are out of order", () => {
		const entries: AuditEntry[] = [
			{ fieldPath: "f", newValue: "older", configVersion: 5 },
			{ fieldPath: "f", newValue: "newest", configVersion: 9 },
		];
		expect(latestEntryForField(entries, "f")?.newValue).toBe("newest");
	});

	it("returns undefined when no entry matches the field path", () => {
		expect(latestEntryForField([{ fieldPath: "x" }], "f")).toBeUndefined();
	});
});
