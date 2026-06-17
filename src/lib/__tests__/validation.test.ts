import { describe, expect, it } from "vitest";
import type { components } from "../../api/schema";
import { constraintHint, parseGoDuration, validateField } from "../validation";

type SchemaField = components["schemas"]["v1SchemaField"];
type FieldType = components["schemas"]["v1FieldType"];
type FieldConstraints = components["schemas"]["v1FieldConstraints"];

/** Build a minimal schema field of the given type with optional constraints. */
function field(
	type: FieldType,
	constraints?: FieldConstraints,
	extra?: Partial<SchemaField>,
): SchemaField {
	return { path: "f", type, constraints, ...extra };
}

describe("validateField — empty handling", () => {
	it("accepts an empty value on a nullable field (explicit unset)", () => {
		expect(validateField(field("FIELD_TYPE_STRING", undefined, { nullable: true }), "")).toBeNull();
		// Whitespace-only is treated as empty too.
		expect(validateField(field("FIELD_TYPE_INT", undefined, { nullable: true }), "   ")).toBeNull();
	});

	it("rejects an empty value on a non-nullable field as Required", () => {
		expect(validateField(field("FIELD_TYPE_STRING"), "")).toMatch(/Required/);
	});
});

describe("validateField — enum (any type)", () => {
	it("accepts a value in the enum set", () => {
		const f = field("FIELD_TYPE_STRING", { enumValues: ["USD", "EUR"] });
		expect(validateField(f, "USD")).toBeNull();
	});

	it("rejects a value outside the enum set, listing the options", () => {
		const f = field("FIELD_TYPE_STRING", { enumValues: ["USD", "EUR"] });
		expect(validateField(f, "JPY")).toMatch(/Must be one of: USD, EUR\./);
	});
});

describe("validateField — int", () => {
	it("rejects a non-integer", () => {
		expect(validateField(field("FIELD_TYPE_INT"), "1.5")).toMatch(/whole number/);
		expect(validateField(field("FIELD_TYPE_INT"), "abc")).toMatch(/whole number/);
	});

	it("accepts a negative integer", () => {
		expect(validateField(field("FIELD_TYPE_INT"), "-7")).toBeNull();
	});

	it("enforces min (inclusive)", () => {
		const f = field("FIELD_TYPE_INT", { min: 0 });
		expect(validateField(f, "-1")).toMatch(/Below minimum — must be ≥ 0\./);
		expect(validateField(f, "0")).toBeNull();
	});

	it("enforces max (inclusive)", () => {
		const f = field("FIELD_TYPE_INT", { max: 10 });
		expect(validateField(f, "11")).toMatch(/Above maximum — must be ≤ 10\./);
		expect(validateField(f, "10")).toBeNull();
	});

	it("enforces exclusiveMin (strict >)", () => {
		const f = field("FIELD_TYPE_INT", { exclusiveMin: 0 });
		expect(validateField(f, "0")).toMatch(/Must be greater than 0\./);
		expect(validateField(f, "1")).toBeNull();
	});

	it("enforces exclusiveMax (strict <)", () => {
		const f = field("FIELD_TYPE_INT", { exclusiveMax: 5 });
		expect(validateField(f, "5")).toMatch(/Must be less than 5\./);
		expect(validateField(f, "4")).toBeNull();
	});
});

describe("validateField — number", () => {
	it("rejects a non-numeric value", () => {
		expect(validateField(field("FIELD_TYPE_NUMBER"), "1.2.3")).toMatch(/Must be a number/);
	});

	it("accepts a decimal and scientific notation", () => {
		expect(validateField(field("FIELD_TYPE_NUMBER"), "3.14")).toBeNull();
		expect(validateField(field("FIELD_TYPE_NUMBER"), "-1.5e3")).toBeNull();
	});

	it("enforces numeric bounds", () => {
		const f = field("FIELD_TYPE_NUMBER", { min: 0, max: 100 });
		expect(validateField(f, "150")).toMatch(/Above maximum/);
		expect(validateField(f, "50")).toBeNull();
	});
});

describe("validateField — bool", () => {
	it("accepts only 'true' / 'false'", () => {
		expect(validateField(field("FIELD_TYPE_BOOL"), "true")).toBeNull();
		expect(validateField(field("FIELD_TYPE_BOOL"), "false")).toBeNull();
		expect(validateField(field("FIELD_TYPE_BOOL"), "yes")).toMatch(/Must be "true" or "false"/);
	});
});

describe("validateField — string constraints", () => {
	it("enforces minLength with the current length in the message", () => {
		const f = field("FIELD_TYPE_STRING", { minLength: 3 });
		expect(validateField(f, "ab")).toMatch(/Too short — at least 3 characters \(now 2\)\./);
	});

	it("enforces maxLength", () => {
		const f = field("FIELD_TYPE_STRING", { maxLength: 4 });
		expect(validateField(f, "toolong")).toMatch(/Too long — at most 4 characters \(now 7\)\./);
	});

	it("enforces a regex match", () => {
		const f = field("FIELD_TYPE_STRING", { regex: "^[a-z]+$" });
		expect(validateField(f, "ABC")).toMatch(/Does not match the required pattern: \^\[a-z\]\+\$/);
		expect(validateField(f, "abc")).toBeNull();
	});

	it("treats an unparseable regex as a pass (server validates)", () => {
		const f = field("FIELD_TYPE_STRING", { regex: "(" });
		expect(validateField(f, "anything")).toBeNull();
	});
});

describe("validateField — duration", () => {
	it("accepts compound and sub-second units", () => {
		expect(validateField(field("FIELD_TYPE_DURATION"), "1h30m")).toBeNull();
		expect(validateField(field("FIELD_TYPE_DURATION"), "500ms")).toBeNull();
	});

	it("rejects an invalid duration", () => {
		expect(validateField(field("FIELD_TYPE_DURATION"), "nope")).toMatch(/Invalid Go duration/);
	});

	it("enforces duration bounds expressed in seconds", () => {
		const f = field("FIELD_TYPE_DURATION", { min: 3600 });
		expect(validateField(f, "30m")).toMatch(/Below minimum — must be ≥ 3600 s\./);
		expect(validateField(f, "2h")).toBeNull();
	});
});

describe("parseGoDuration — each unit", () => {
	it("parses every supported unit to seconds", () => {
		expect(parseGoDuration("1ns")).toBeCloseTo(1e-9);
		expect(parseGoDuration("1us")).toBeCloseTo(1e-6);
		expect(parseGoDuration("1µs")).toBeCloseTo(1e-6);
		expect(parseGoDuration("1ms")).toBeCloseTo(1e-3);
		expect(parseGoDuration("1s")).toBe(1);
		expect(parseGoDuration("2m")).toBe(120);
		expect(parseGoDuration("1h")).toBe(3600);
		expect(parseGoDuration("1h30m")).toBe(5400);
	});

	it("returns null for an unparseable string", () => {
		expect(parseGoDuration("")).toBeNull();
		expect(parseGoDuration("10x")).toBeNull();
	});
});

describe("validateField — time", () => {
	it("accepts an RFC 3339 timestamp", () => {
		expect(validateField(field("FIELD_TYPE_TIME"), "2025-01-15T09:30:00Z")).toBeNull();
	});

	it("rejects an invalid timestamp", () => {
		expect(validateField(field("FIELD_TYPE_TIME"), "not-a-date")).toMatch(/Invalid timestamp/);
	});
});

describe("validateField — url", () => {
	it("accepts an absolute URL", () => {
		expect(validateField(field("FIELD_TYPE_URL"), "https://example.com/x")).toBeNull();
	});

	it("rejects a non-absolute / unparseable URL", () => {
		expect(validateField(field("FIELD_TYPE_URL"), "not a url")).toMatch(/Not a valid URL/);
	});

	it("rejects a URL with no host as not absolute", () => {
		expect(validateField(field("FIELD_TYPE_URL"), "mailto:nobody")).toMatch(
			/Must be an absolute URL/,
		);
	});
});

describe("validateField — json", () => {
	it("accepts valid JSON", () => {
		expect(validateField(field("FIELD_TYPE_JSON"), '{"a":1}')).toBeNull();
	});

	it("rejects invalid JSON", () => {
		expect(validateField(field("FIELD_TYPE_JSON"), "{ broken")).toMatch(/Must be valid JSON/);
	});
});

describe("validateField — unspecified type falls through", () => {
	it("returns null for an unknown / unspecified type with a value", () => {
		expect(validateField(field("FIELD_TYPE_UNSPECIFIED"), "whatever")).toBeNull();
	});
});

describe("constraintHint", () => {
	it("hints just the type word when no constraints", () => {
		expect(constraintHint(field("FIELD_TYPE_BOOL"))).toBe("bool");
	});

	it("includes format, min, max", () => {
		const f = field("FIELD_TYPE_INT", { min: 0, max: 10 }, { format: "int32" });
		expect(constraintHint(f)).toBe("int · format int32 · min 0 · max 10");
	});

	it("includes exclusive bounds", () => {
		const f = field("FIELD_TYPE_NUMBER", { exclusiveMin: 0, exclusiveMax: 1 });
		expect(constraintHint(f)).toBe("number · > 0 · < 1");
	});

	it("renders a length range when both min and max length are set", () => {
		const f = field("FIELD_TYPE_STRING", { minLength: 2, maxLength: 8 });
		expect(constraintHint(f)).toBe("string · 2–8 chars");
	});

	it("renders a single-sided length hint (min only, then max only)", () => {
		expect(constraintHint(field("FIELD_TYPE_STRING", { minLength: 3 }))).toBe("string · ≥ 3 chars");
		expect(constraintHint(field("FIELD_TYPE_STRING", { maxLength: 5 }))).toBe("string · ≤ 5 chars");
	});

	it("notes pattern and json-schema constraints", () => {
		expect(constraintHint(field("FIELD_TYPE_STRING", { regex: "^x$" }))).toBe("string · pattern");
		expect(constraintHint(field("FIELD_TYPE_JSON", { jsonSchema: "{}" }))).toBe(
			"json · json-schema",
		);
	});

	it("labels every type word, including duration/time/url and the fallback", () => {
		expect(constraintHint(field("FIELD_TYPE_DURATION"))).toBe("duration");
		expect(constraintHint(field("FIELD_TYPE_TIME"))).toBe("time");
		expect(constraintHint(field("FIELD_TYPE_URL"))).toBe("url");
		expect(constraintHint(field("FIELD_TYPE_UNSPECIFIED"))).toBe("value");
		// undefined type also falls through to the "value" word.
		expect(constraintHint({ path: "f" } as SchemaField)).toBe("value");
	});
});
