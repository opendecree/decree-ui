import { describe, expect, it } from "vitest";
import { formatError, GRPC_CODE_ABORTED, isAbortedConflict } from "../api-error";

describe("isAbortedConflict", () => {
	it("recognises a gRPC ABORTED (code 10) status", () => {
		expect(isAbortedConflict({ code: GRPC_CODE_ABORTED, message: "stale" })).toBe(true);
	});

	it("falls back to the 'checksum' message substring when the code is absent", () => {
		expect(isAbortedConflict({ message: "expected_checksum mismatch" })).toBe(true);
	});

	it("falls back to the 'aborted' message substring (case-insensitive)", () => {
		expect(isAbortedConflict({ message: "Write ABORTED by server" })).toBe(true);
	});

	it("falls back to the 'conflict' message substring", () => {
		expect(isAbortedConflict({ message: "optimistic concurrency conflict" })).toBe(true);
	});

	it("returns false for a non-conflict error code + unrelated message", () => {
		expect(isAbortedConflict({ code: 3, message: "invalid argument" })).toBe(false);
	});

	it("returns false for a non-object error (null, string, undefined)", () => {
		expect(isAbortedConflict(null)).toBe(false);
		expect(isAbortedConflict("checksum")).toBe(false);
		expect(isAbortedConflict(undefined)).toBe(false);
	});

	it("returns false for an object with a non-string message and no matching code", () => {
		expect(isAbortedConflict({ code: 5, message: 123 })).toBe(false);
		expect(isAbortedConflict({})).toBe(false);
	});
});

describe("formatError", () => {
	it("returns the message string from an rpcStatus-shaped error", () => {
		expect(formatError({ message: "field not found" })).toBe("field not found");
	});

	it("falls back for an object whose message is empty", () => {
		expect(formatError({ message: "" })).toBe("An unexpected error occurred");
	});

	it("falls back for an object whose message is not a string", () => {
		expect(formatError({ message: 42 })).toBe("An unexpected error occurred");
	});

	it("falls back for a non-object / message-less error", () => {
		expect(formatError(null)).toBe("An unexpected error occurred");
		expect(formatError("boom")).toBe("An unexpected error occurred");
		expect(formatError({})).toBe("An unexpected error occurred");
	});
});
