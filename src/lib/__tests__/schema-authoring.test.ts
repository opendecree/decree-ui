import { describe, expect, it } from "vitest";
import type { components } from "../../api/schema";
import {
	buildUpdateBody,
	cleanConstraints,
	constraintKind,
	diffFields,
	duplicatePaths,
	FIELD_TYPE_ORDER,
	FLAG_DEFS,
	fieldChanged,
	isDirty,
	isRuleComplete,
	newFieldDraft,
	summarizeRule,
	validateFieldDef,
} from "../schema-authoring";

type SchemaField = components["schemas"]["v1SchemaField"];

const baseField = (over: Partial<SchemaField> = {}): SchemaField => ({
	path: "a.b",
	type: "FIELD_TYPE_STRING",
	constraints: {},
	...over,
});

describe("FIELD_TYPE_ORDER + FLAG_DEFS", () => {
	it("lists all eight authorable types", () => {
		expect(FIELD_TYPE_ORDER).toHaveLength(8);
		expect(FIELD_TYPE_ORDER).toContain("FIELD_TYPE_INT");
		expect(FIELD_TYPE_ORDER).toContain("FIELD_TYPE_JSON");
		expect(FIELD_TYPE_ORDER).not.toContain("FIELD_TYPE_UNSPECIFIED");
	});

	it("exposes the five field flags with camelCase keys", () => {
		const keys = FLAG_DEFS.map((f) => f.key);
		expect(keys).toEqual(["nullable", "readOnly", "writeOnce", "sensitive", "deprecated"]);
	});
});

describe("constraintKind", () => {
	it("maps int/number to numeric", () => {
		expect(constraintKind("FIELD_TYPE_INT")).toBe("numeric");
		expect(constraintKind("FIELD_TYPE_NUMBER")).toBe("numeric");
	});
	it("maps string/duration/url/json to their kinds", () => {
		expect(constraintKind("FIELD_TYPE_STRING")).toBe("string");
		expect(constraintKind("FIELD_TYPE_DURATION")).toBe("duration");
		expect(constraintKind("FIELD_TYPE_URL")).toBe("url");
		expect(constraintKind("FIELD_TYPE_JSON")).toBe("json");
	});
	it("maps bool/time/undefined to none", () => {
		expect(constraintKind("FIELD_TYPE_BOOL")).toBe("none");
		expect(constraintKind("FIELD_TYPE_TIME")).toBe("none");
		expect(constraintKind(undefined)).toBe("none");
	});
});

describe("newFieldDraft", () => {
	it("seeds a string field with a unique synthetic path", () => {
		expect(newFieldDraft(3)).toEqual({
			path: "new.field_3",
			type: "FIELD_TYPE_STRING",
			constraints: {},
		});
	});
});

describe("cleanConstraints", () => {
	it("returns undefined for undefined or fully-empty constraints", () => {
		expect(cleanConstraints(undefined)).toBeUndefined();
		expect(cleanConstraints({})).toBeUndefined();
		expect(cleanConstraints({ regex: "  ", jsonSchema: "" })).toBeUndefined();
	});
	it("keeps numeric zero and non-empty values, drops blanks", () => {
		expect(cleanConstraints({ min: 0, max: 10, regex: "", enumValues: [] })).toEqual({
			min: 0,
			max: 10,
		});
	});
	it("keeps a populated enum and json schema", () => {
		expect(cleanConstraints({ enumValues: ["a"], jsonSchema: "{}" })).toEqual({
			enumValues: ["a"],
			jsonSchema: "{}",
		});
	});
	it("keeps exclusive bounds and length bounds", () => {
		expect(
			cleanConstraints({ exclusiveMin: 1, exclusiveMax: 9, minLength: 2, maxLength: 5 }),
		).toEqual({ exclusiveMin: 1, exclusiveMax: 9, minLength: 2, maxLength: 5 });
	});
});

describe("fieldChanged", () => {
	it("treats a field with no baseline as changed (added)", () => {
		expect(fieldChanged(baseField(), undefined)).toBe(true);
	});
	it("is false for an identical field (ignoring empty constraints)", () => {
		expect(fieldChanged(baseField(), baseField())).toBe(false);
	});
	it("detects a title change", () => {
		expect(fieldChanged(baseField({ title: "X" }), baseField())).toBe(true);
	});
	it("detects a constraint change", () => {
		expect(
			fieldChanged(baseField({ constraints: { min: 1 } }), baseField({ constraints: {} })),
		).toBe(true);
	});
	it("ignores cosmetic empty-string vs missing differences", () => {
		expect(fieldChanged(baseField({ description: "" }), baseField())).toBe(false);
	});
});

describe("diffFields + isDirty", () => {
	const baseline: SchemaField[] = [
		baseField({ path: "a", title: "A" }),
		baseField({ path: "b", title: "B" }),
	];

	it("reports no diff for an identical draft", () => {
		const diff = diffFields(baseline, baseline);
		expect(diff).toEqual({ added: [], modified: [], removed: [] });
		expect(isDirty(diff)).toBe(false);
	});

	it("detects added, modified, and removed fields together", () => {
		const draft: SchemaField[] = [
			baseField({ path: "a", title: "A2" }), // modified
			baseField({ path: "c", title: "C" }), // added
		];
		const diff = diffFields(draft, baseline);
		expect(diff.added).toEqual(["c"]);
		expect(diff.modified).toEqual(["a"]);
		expect(diff.removed).toEqual(["b"]);
		expect(isDirty(diff)).toBe(true);
	});
});

describe("buildUpdateBody", () => {
	const baseline: SchemaField[] = [
		baseField({ path: "a", title: "A" }),
		baseField({ path: "b", title: "B" }),
	];

	it("sends only the changed + added fields and removed paths", () => {
		const draft: SchemaField[] = [
			baseField({ path: "a", title: "A2" }), // modified
			baseField({ path: "c", title: "C" }), // added
		];
		const body = buildUpdateBody(draft, baseline, "note");
		expect(body.versionDescription).toBe("note");
		expect(body.removeFields).toEqual(["b"]);
		const paths = (body.fields ?? []).map((f) => f.path).sort();
		expect(paths).toEqual(["a", "c"]);
	});

	it("omits empty fields / removeFields / versionDescription", () => {
		const body = buildUpdateBody(baseline, baseline, "   ");
		expect(body.fields).toBeUndefined();
		expect(body.removeFields).toBeUndefined();
		expect(body.versionDescription).toBeUndefined();
	});

	it("strips no-op constraints from the outgoing fields", () => {
		const draft: SchemaField[] = [
			baseField({ path: "a", title: "A", constraints: { min: 1, regex: "" } }),
			baseField({ path: "b", title: "B" }),
		];
		const body = buildUpdateBody(draft, baseline, "");
		expect(body.fields?.[0].constraints).toEqual({ min: 1 });
	});
});

describe("validateFieldDef", () => {
	it("rejects an empty path", () => {
		expect(validateFieldDef(baseField({ path: "" }))).toMatch(/Path is required/);
	});
	it("rejects a malformed path", () => {
		expect(validateFieldDef(baseField({ path: "bad path!" }))).toMatch(/dotted segments/);
	});
	it("accepts a well-formed dotted path", () => {
		expect(validateFieldDef(baseField({ path: "a.b_c.d2" }))).toBeNull();
	});
	it("rejects an uncompilable regex", () => {
		expect(validateFieldDef(baseField({ constraints: { regex: "(" } }))).toMatch(
			/valid regular expression/,
		);
	});
	it("rejects invalid JSON schema on a json field", () => {
		expect(
			validateFieldDef(
				baseField({ type: "FIELD_TYPE_JSON", constraints: { jsonSchema: "{ broken" } }),
			),
		).toMatch(/valid JSON/);
	});
	it("rejects negative and inverted length bounds", () => {
		expect(validateFieldDef(baseField({ constraints: { minLength: -1 } }))).toMatch(
			/cannot be negative/,
		);
		expect(validateFieldDef(baseField({ constraints: { minLength: 5, maxLength: 2 } }))).toMatch(
			/exceed maximum length/,
		);
	});
	it("rejects inverted min/max", () => {
		expect(validateFieldDef(baseField({ constraints: { min: 10, max: 1 } }))).toMatch(
			/cannot exceed maximum/,
		);
	});
});

describe("duplicatePaths", () => {
	it("returns the set of colliding paths, ignoring blanks", () => {
		const dupes = duplicatePaths([
			baseField({ path: "a" }),
			baseField({ path: "a" }),
			baseField({ path: "" }),
			baseField({ path: "b" }),
		]);
		expect([...dupes]).toEqual(["a"]);
	});
});

describe("dependent rules helpers", () => {
	it("isRuleComplete requires both sides non-empty", () => {
		expect(isRuleComplete({ when: [], require: [] })).toBe(false);
		expect(isRuleComplete({ when: ["a"], require: [] })).toBe(false);
		expect(isRuleComplete({ when: ["a"], require: ["b"] })).toBe(true);
	});
	it("summarizeRule renders a complete rule and flags an incomplete one", () => {
		expect(summarizeRule({ when: ["a", "b"], require: ["c"] })).toBe(
			"require c when a + b present",
		);
		expect(summarizeRule({ when: [], require: ["c"] })).toBe("incomplete rule");
	});
});
