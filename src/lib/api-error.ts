import type { components } from "../api/schema";

type RpcStatus = components["schemas"]["rpcStatus"];

/**
 * gRPC `ABORTED` status code. The config service returns this when a write
 * carries a stale `expected_checksum` (optimistic-concurrency conflict) — the
 * config advanced underneath the staged edit, so the batch is rejected whole.
 * See ConfigServiceSetFieldBody.expectedChecksum in the generated schema.
 */
export const GRPC_CODE_ABORTED = 10;

/**
 * gRPC `FAILED_PRECONDITION` status code. `RollbackToVersion` re-guards every
 * restored field server-side and rejects the whole rollback atomically when any
 * one is locked / read-only / write-once / invalid under the *current* rules.
 * The server surfaces that as FAILED_PRECONDITION (nothing is written).
 */
export const GRPC_CODE_FAILED_PRECONDITION = 9;

/**
 * Whether an API error is an atomic rollback rejection — the server re-guarded a
 * restored field and refused the whole `RollbackToVersion`. Recognised by the
 * `FAILED_PRECONDITION` gRPC code, with a message-text fallback (locked /
 * read-only / write-once) so the surfacing still fires if a gateway drops the
 * numeric code. Mirrors `isAbortedConflict`'s detection shape.
 */
export function isRollbackRejected(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const status = error as RpcStatus;
	if (status.code === GRPC_CODE_FAILED_PRECONDITION) return true;
	const msg = typeof status.message === "string" ? status.message.toLowerCase() : "";
	return (
		msg.includes("lock") ||
		msg.includes("read-only") ||
		msg.includes("read only") ||
		msg.includes("write-once") ||
		msg.includes("write once") ||
		msg.includes("immutable") ||
		msg.includes("re-guard") ||
		msg.includes("reguard")
	);
}

/** Extract a human-readable message from an API error body (rpcStatus) or unknown. */
export function formatError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		const m = (error as { message?: unknown }).message;
		if (typeof m === "string" && m.length > 0) return m;
	}
	return "An unexpected error occurred";
}

/**
 * Whether an API error is an optimistic-concurrency conflict — a stale checksum
 * rejected with `ABORTED`. Recognised by the gRPC code; falls back to the message
 * text so the rebase flow still triggers if a gateway omits the numeric code.
 */
export function isAbortedConflict(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const status = error as RpcStatus;
	if (status.code === GRPC_CODE_ABORTED) return true;
	const msg = typeof status.message === "string" ? status.message.toLowerCase() : "";
	return msg.includes("checksum") || msg.includes("aborted") || msg.includes("conflict");
}
