import type { components } from "../api/schema";

type RpcStatus = components["schemas"]["rpcStatus"];

/**
 * gRPC `ABORTED` status code. The config service returns this when a write
 * carries a stale `expected_checksum` (optimistic-concurrency conflict) — the
 * config advanced underneath the staged edit, so the batch is rejected whole.
 * See ConfigServiceSetFieldBody.expectedChecksum in the generated schema.
 */
export const GRPC_CODE_ABORTED = 10;

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
