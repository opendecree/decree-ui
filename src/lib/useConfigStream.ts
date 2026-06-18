import { useEffect, useRef, useState } from "react";
import type { components } from "../api/schema";
import { useAuth } from "./auth";
import { config } from "./config";
import { typedValueToString } from "./fields";

type ConfigChange = components["schemas"]["v1ConfigChange"];
type AuditEntry = components["schemas"]["v1AuditEntry"];

/** Cap on retained live changes: the read-view feed only shows recent activity, so
 * keeping an unbounded history just grows memory and re-render cost for no benefit. */
export const MAX_LIVE_CHANGES = 200;

/** Whether a streamed change cleared the field (a deliberate write of null). */
export function isStreamClear(change: ConfigChange): boolean {
	const hadOld = change.oldValue !== undefined && typedValueToString(change.oldValue) !== "";
	const hasNew = change.newValue !== undefined && typedValueToString(change.newValue) !== "";
	return hadOld && !hasNew;
}

/**
 * Fold live changes (newest-first) into a value overlay keyed by field path. The
 * newest event for a path wins, so we keep only the first occurrence seen. A clear
 * maps to `null` (signalling an explicit-null overlay, distinct from "absent").
 */
export function streamValueOverlay(changes: ConfigChange[]): Map<string, string | null> {
	const overlay = new Map<string, string | null>();
	for (const change of changes) {
		const path = change.fieldPath;
		if (!path || overlay.has(path)) continue;
		overlay.set(path, isStreamClear(change) ? null : typedValueToString(change.newValue));
	}
	return overlay;
}

/**
 * The set of field paths touched by live events — used to mark rows as freshly
 * updated (a "live" badge + flash) and to drop their now-stale checksum, which the
 * `ConfigChange` event does not carry.
 */
export function streamTouchedPaths(changes: ConfigChange[]): Set<string> {
	const touched = new Set<string>();
	for (const change of changes) {
		if (change.fieldPath) touched.add(change.fieldPath);
	}
	return touched;
}

/**
 * Adapt a streamed `v1ConfigChange` to the `v1AuditEntry` shape the recent-changes
 * feed already renders, so live items and historical ones share one renderer. The
 * change carries `TypedValue` old/new values (the feed reads strings) and a
 * synthetic id derived from change-intrinsic fields (tenant, version, field path,
 * changedAt) keeps React keys stable across re-renders — the buffer is prepend-only,
 * so the id must not depend on the change's position in the array.
 */
export function changeToAuditEntry(change: ConfigChange): AuditEntry {
	const cleared = isStreamClear(change);
	return {
		id: `live-${change.tenantId ?? ""}-${change.version ?? ""}-${change.fieldPath ?? ""}-${change.changedAt ?? ""}`,
		tenantId: change.tenantId,
		actor: change.changedBy,
		action: cleared ? "clear_field" : "set_field",
		fieldPath: change.fieldPath,
		oldValue: change.oldValue !== undefined ? typedValueToString(change.oldValue) : undefined,
		newValue: change.newValue !== undefined ? typedValueToString(change.newValue) : undefined,
		configVersion: change.version,
		createdAt: change.changedAt,
	};
}

/**
 * The streamed-message frame the REST gateway emits for a server-streaming RPC.
 * grpc-gateway wraps each newline-delimited JSON object as `{"result": <msg>}`
 * (and `{"error": <status>}` on a mid-stream error) — it is *not* SSE, so this is
 * parsed by hand rather than via `EventSource`. The inner message is a
 * `v1SubscribeResponse`, whose `change` is the actual `v1ConfigChange`.
 */
interface StreamFrame {
	result?: { change?: ConfigChange };
	error?: { message?: string };
}

/** Connection state of the live subscription. */
export type StreamStatus = "connecting" | "live" | "fallback";

export interface ConfigStream {
	/** Live changes, newest first. Empty until the first event (or in fallback). */
	changes: ConfigChange[];
	/** "live" once the stream is open; "fallback" when it errored/unavailable. */
	status: StreamStatus;
}

/**
 * Build the absolute subscribe URL the same way `createApiClient` builds requests:
 * on `config.apiUrl` (empty = same origin, proxied in dev/Docker). Field-path
 * filtering is left empty so the read view receives every field's changes.
 */
function subscribeUrl(tenantId: string): string {
	const base = config.apiUrl || "";
	return `${base}/v1/tenants/${encodeURIComponent(tenantId)}/config:subscribe`;
}

/**
 * Live config subscription for the read view, against the server `Subscribe` RPC
 * via the REST gateway. Uses `fetch` + `ReadableStream` (not `EventSource`, which
 * cannot set this app's `x-subject`/`x-role` metadata headers and expects SSE
 * framing) so it can send the *same* auth headers as the openapi-fetch client and
 * parse the gateway's NDJSON frames.
 *
 * Fail-safe by design: if `fetch` rejects, the response has no body, the
 * environment lacks streaming, or a frame carries an error, the hook flips to
 * `"fallback"` so the caller leans on its polling query data instead — the stream
 * is the live path, the query hooks remain the source of truth underneath it.
 *
 * Teardown is total: on unmount or a `tenantId` change the in-flight fetch is
 * aborted and the reader is cancelled, and a closed-over `cancelled` guard blocks
 * any state update after teardown (no leaks, no act-after-unmount warnings).
 */
export function useConfigStream(tenantId: string): ConfigStream {
	const { auth } = useAuth();
	const [changes, setChanges] = useState<ConfigChange[]>([]);
	const [status, setStatus] = useState<StreamStatus>("connecting");

	// Auth is read through a ref so a change to the auth object doesn't tear down
	// and re-open a healthy stream; the subscription only re-establishes per tenant.
	const authRef = useRef(auth);
	authRef.current = auth;

	useEffect(() => {
		if (!tenantId) {
			setStatus("fallback");
			return;
		}

		// No streaming in this environment (e.g. older runtime): fail safe to refetch.
		if (typeof fetch !== "function" || typeof AbortController !== "function") {
			setStatus("fallback");
			return;
		}

		let cancelled = false;
		const controller = new AbortController();
		// Reset for the new tenant so stale events never bleed across a switch.
		setChanges([]);
		setStatus("connecting");

		const fallback = () => {
			if (!cancelled) setStatus("fallback");
		};

		const run = async () => {
			let response: Response;
			try {
				const { subject, role, tenantId: authTenantId } = authRef.current;
				const headers: Record<string, string> = {
					accept: "application/json",
					"x-subject": subject,
					"x-role": role,
				};
				if (authTenantId) headers["x-tenant-id"] = authTenantId;

				response = await fetch(subscribeUrl(tenantId), {
					method: "GET",
					headers,
					signal: controller.signal,
				});
			} catch {
				// Network failure / abort during connect → fall back to query data.
				fallback();
				return;
			}

			if (cancelled) return;
			if (!response.ok || !response.body) {
				fallback();
				return;
			}

			setStatus("live");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			const handleLine = (line: string) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				let frame: StreamFrame;
				try {
					frame = JSON.parse(trimmed) as StreamFrame;
				} catch {
					// A partial/garbled frame is non-fatal — skip it, keep streaming.
					return;
				}
				if (frame.error) {
					// A mid-stream error frame ends the live path; lean on refetch.
					fallback();
					controller.abort();
					return;
				}
				const change = frame.result?.change;
				if (change && !cancelled) {
					setChanges((prev) => [change, ...prev].slice(0, MAX_LIVE_CHANGES));
				}
			};

			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					if (cancelled) return;
					buffer += decoder.decode(value, { stream: true });
					// NDJSON: split on newlines, keep the trailing partial in the buffer.
					let newlineIndex = buffer.indexOf("\n");
					while (newlineIndex !== -1) {
						handleLine(buffer.slice(0, newlineIndex));
						buffer = buffer.slice(newlineIndex + 1);
						newlineIndex = buffer.indexOf("\n");
					}
				}
				// Flush any trailing line that wasn't newline-terminated.
				if (buffer) handleLine(buffer);
				// The server closed the stream — drop back to polling.
				fallback();
			} catch {
				// Read error (incl. abort on teardown) → fall back to query data.
				fallback();
			}
		};

		run();

		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [tenantId]);

	return { changes, status };
}
