import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "../../api/schema";
import {
	changeToAuditEntry,
	isStreamClear,
	streamTouchedPaths,
	streamValueOverlay,
	useConfigStream,
} from "../useConfigStream";

type ConfigChange = components["schemas"]["v1ConfigChange"];

// Auth is read from context; stub it so the hook builds the same headers the
// openapi-fetch client does, without needing an AuthProvider in the test.
vi.mock("../auth", () => ({
	useAuth: () => ({ auth: { subject: "carol@acme", role: "user", tenantId: "t1" } }),
}));

/** Build a ReadableStream that emits each chunk (as UTF-8 bytes) then closes. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let i = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (i < chunks.length) {
				controller.enqueue(encoder.encode(chunks[i]));
				i += 1;
			} else {
				controller.close();
			}
		},
	});
}

/** A never-closing stream whose reader rejects when its signal aborts. */
function pendingStream(signal: AbortSignal): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		pull() {
			return new Promise<void>((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
					once: true,
				});
			});
		},
	});
}

function frame(change: Partial<ConfigChange>): string {
	return `${JSON.stringify({ result: { change } })}\n`;
}

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
	vi.restoreAllMocks();
});

describe("useConfigStream — pure helpers", () => {
	it("isStreamClear is true only when an old value existed and the new is empty", () => {
		expect(isStreamClear({ oldValue: { stringValue: "x" }, newValue: { stringValue: "" } })).toBe(
			true,
		);
		expect(isStreamClear({ oldValue: { stringValue: "x" }, newValue: { stringValue: "y" } })).toBe(
			false,
		);
		expect(isStreamClear({ newValue: { stringValue: "y" } })).toBe(false);
		expect(isStreamClear({ oldValue: { stringValue: "x" } })).toBe(true);
	});

	it("streamValueOverlay keeps the newest value per path and maps a clear to null", () => {
		const changes: ConfigChange[] = [
			{ fieldPath: "a", newValue: { stringValue: "new-a" } }, // newest wins
			{ fieldPath: "a", newValue: { stringValue: "old-a" } },
			{ fieldPath: "b", oldValue: { stringValue: "had" }, newValue: { stringValue: "" } }, // clear
			{ newValue: { stringValue: "no-path" } }, // ignored
		];
		const overlay = streamValueOverlay(changes);
		expect(overlay.get("a")).toBe("new-a");
		expect(overlay.get("b")).toBeNull();
		expect(overlay.size).toBe(2);
	});

	it("streamTouchedPaths collects every changed field path", () => {
		const touched = streamTouchedPaths([
			{ fieldPath: "a" },
			{ fieldPath: "b" },
			{ fieldPath: "a" },
			{},
		]);
		expect([...touched].sort()).toEqual(["a", "b"]);
	});

	it("changeToAuditEntry adapts a change to the audit-entry shape", () => {
		const entry = changeToAuditEntry(
			{
				tenantId: "t1",
				version: 9,
				fieldPath: "payments.enabled",
				oldValue: { boolValue: false },
				newValue: { boolValue: true },
				changedBy: "carol@acme",
				changedAt: "2026-06-15T00:00:00Z",
			},
			0,
		);
		expect(entry).toMatchObject({
			actor: "carol@acme",
			action: "set_field",
			fieldPath: "payments.enabled",
			oldValue: "false",
			newValue: "true",
			configVersion: 9,
		});
		expect(entry.id).toContain("live-");
	});

	it("changeToAuditEntry marks a clear as clear_field", () => {
		const entry = changeToAuditEntry(
			{ fieldPath: "x", oldValue: { stringValue: "v" }, newValue: { stringValue: "" } },
			1,
		);
		expect(entry.action).toBe("clear_field");
	});
});

describe("useConfigStream — live path", () => {
	it("parses framed NDJSON (incl. split lines) and accumulates changes newest-first", async () => {
		globalThis.fetch = vi.fn(async () => {
			return new Response(
				streamOf([
					frame({ fieldPath: "a", version: 2, newValue: { stringValue: "first" } }),
					// Two frames in one chunk + a partial line that completes in the next chunk.
					`${JSON.stringify({ result: { change: { fieldPath: "b", version: 3 } } })}\n{"result":{"chan`,
					'ge":{"fieldPath":"c","version":4}}}\n',
				]),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));

		await waitFor(() => expect(result.current.changes.length).toBe(3));
		// Newest event is first (line-buffered parse stitched the split frame).
		expect(result.current.changes[0].fieldPath).toBe("c");
		expect(result.current.changes[2].fieldPath).toBe("a");
	});

	it("reports status 'live' while the stream is open", async () => {
		const controller = new AbortController();
		globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
			const signal = (init?.signal as AbortSignal) ?? controller.signal;
			return new Response(pendingStream(signal), { status: 200 });
		}) as unknown as typeof fetch;

		const { result, unmount } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("live"));
		unmount();
	});

	it("sends the same auth headers and the subscribe URL", async () => {
		const spy = vi.fn(async () => new Response(streamOf([]), { status: 200 }));
		globalThis.fetch = spy as unknown as typeof fetch;

		renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(spy).toHaveBeenCalled());

		const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toContain("/v1/tenants/t1/config:subscribe");
		const headers = init.headers as Record<string, string>;
		expect(headers["x-subject"]).toBe("carol@acme");
		expect(headers["x-role"]).toBe("user");
		expect(headers["x-tenant-id"]).toBe("t1");
	});

	it("skips garbled frames but keeps streaming", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					streamOf(["not json\n", frame({ fieldPath: "ok", newValue: { stringValue: "v" } })]),
					{ status: 200 },
				),
		) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.changes.length).toBe(1));
		expect(result.current.changes[0].fieldPath).toBe("ok");
	});

	it("flushes a trailing line that was not newline-terminated", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				// Note: no trailing "\n" — the line is flushed when the stream closes.
				new Response(streamOf([JSON.stringify({ result: { change: { fieldPath: "tail" } } })]), {
					status: 200,
				}),
		) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.changes.length).toBe(1));
		expect(result.current.changes[0].fieldPath).toBe("tail");
	});

	it("ignores empty lines and frames with no change payload", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(streamOf(["\n", `${JSON.stringify({ result: {} })}\n`, "   \n"]), {
					status: 200,
				}),
		) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		// No usable change → stays empty, then falls back when the stream closes.
		await waitFor(() => expect(result.current.status).toBe("fallback"));
		expect(result.current.changes).toEqual([]);
	});
});

describe("useConfigStream — fallback path", () => {
	it("falls back when fetch rejects", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error("network down");
		}) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("fallback"));
		expect(result.current.changes).toEqual([]);
	});

	it("falls back on a non-ok response", async () => {
		globalThis.fetch = vi.fn(async () => new Response("nope", { status: 503 })) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("fallback"));
	});

	it("falls back when the response has no body", async () => {
		globalThis.fetch = vi.fn(async () => ({
			ok: true,
			body: null,
		})) as unknown as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("fallback"));
	});

	it("falls back when a frame carries a mid-stream error", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(streamOf([`${JSON.stringify({ error: { message: "boom" } })}\n`]), {
					status: 200,
				}),
		) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("fallback"));
	});

	it("falls back to refetch when the stream closes (server ended it)", async () => {
		globalThis.fetch = vi.fn(
			async () => new Response(streamOf([frame({ fieldPath: "a" })]), { status: 200 }),
		) as typeof fetch;

		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("fallback"));
		// The change seen before close is still retained.
		expect(result.current.changes.length).toBe(1);
	});

	it("falls back immediately without a tenant id (no fetch)", async () => {
		const spy = vi.fn();
		globalThis.fetch = spy as unknown as typeof fetch;
		const { result } = renderHook(() => useConfigStream(""));
		await waitFor(() => expect(result.current.status).toBe("fallback"));
		expect(spy).not.toHaveBeenCalled();
	});

	it("falls back when the runtime lacks fetch", async () => {
		// Simulate an environment without fetch (e.g. an older runtime).
		(globalThis as { fetch?: typeof fetch }).fetch = undefined;
		const { result } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("fallback"));
	});
});

describe("useConfigStream — teardown", () => {
	let aborted: boolean;

	beforeEach(() => {
		aborted = false;
	});

	it("aborts the in-flight fetch and cancels the reader on unmount", async () => {
		globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
			const signal = init?.signal as AbortSignal;
			signal.addEventListener("abort", () => {
				aborted = true;
			});
			return new Response(pendingStream(signal), { status: 200 });
		}) as unknown as typeof fetch;

		const { result, unmount } = renderHook(() => useConfigStream("t1"));
		await waitFor(() => expect(result.current.status).toBe("live"));

		unmount();
		await waitFor(() => expect(aborted).toBe(true));
	});

	it("re-establishes the stream and clears changes when tenantId changes", async () => {
		const calls: string[] = [];
		globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
			calls.push(String(url));
			const signal = init?.signal as AbortSignal;
			// First tenant: a pending stream we later abort; second: emits one change.
			if (String(url).includes("/t1/")) {
				return new Response(pendingStream(signal), { status: 200 });
			}
			return new Response(streamOf([frame({ fieldPath: "z" })]), { status: 200 });
		}) as unknown as typeof fetch;

		const { result, rerender } = renderHook(({ id }) => useConfigStream(id), {
			initialProps: { id: "t1" },
		});
		await waitFor(() => expect(result.current.status).toBe("live"));

		rerender({ id: "t2" });
		await waitFor(() => expect(result.current.changes.some((c) => c.fieldPath === "z")).toBe(true));
		expect(calls.some((u) => u.includes("/t1/"))).toBe(true);
		expect(calls.some((u) => u.includes("/t2/"))).toBe(true);
	});
});
