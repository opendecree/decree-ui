/**
 * Broken-chain (tamper-detected) panel — the alarming inverse of the "chain
 * active" trust badge.
 *
 * API REALITY: the decree server maintains a SHA-256-linked, per-tenant audit
 * chain, but the REST gateway exposes **no** chain-verification RPC, and the
 * audit-entry model carries **no** hash fields. There is no `VerifyChain`
 * operation and no `v1AuditChainBreak` model in the generated schema. So this is
 * built to the *documented* shape from a typed local model — it does NOT invent
 * an endpoint or fake a fetch. When no break is supplied (the steady state until
 * the gateway exposes `VerifyChain`), it degrades to a clearly-marked
 * pending-server note. It activates unchanged once a real break flows in.
 *
 * Shape mirrors the audit-service proto's `AuditChainBreak`:
 *
 *   VerifyChainResponse { tenant_id, total, ok, breaks[] }
 *   AuditChainBreak     { entry_id, position (0-based), got, want }
 *
 *   - `got`  = the `entry_hash` STORED on the entry
 *   - `want` = the hash RECOMPUTED (SHA-256) from the entry's fields
 *   - break  = `got != want`
 */

/**
 * One chain break, exactly matching the audit-service `AuditChainBreak` message.
 * `position` is 0-based. Typed locally because the gateway does not (yet) expose
 * the model; the field names are kept identical so wiring to the real response is
 * a one-line swap once `VerifyChain` lands.
 */
export interface AuditChainBreak {
	/** The id of the entry whose stored hash no longer matches the recomputed one. */
	entryId: string;
	/** 0-based index of the breaking entry within the tenant's chain. */
	position: number;
	/** The `entry_hash` stored on the entry in the DB. */
	got: string;
	/** The SHA-256 recomputed from the entry's fields. break = got != want. */
	want: string;
	/** Optional context surfaced from the entry, if available. */
	actor?: string;
	/** Optional action label surfaced from the entry, if available. */
	action?: string;
}

/** Total entries walked + how many verified, for the summary line (optional). */
export interface ChainVerification {
	/** Total entries in the chain (proto: `total`). */
	total?: number;
	/** Whether the whole chain verified (proto: `ok`). */
	ok?: boolean;
	/** The breaks found (proto: `breaks[]`). Empty/undefined → chain intact. */
	breaks?: AuditChainBreak[];
}

/** Shorten a hash for display while keeping head + tail recognisable. */
function shortHash(hash: string): string {
	if (hash.length <= 12) return hash;
	return `${hash.slice(0, 4)}…${hash.slice(-3)}`;
}

/**
 * Render the broken-chain detail for the *first* break (the chain is untrusted
 * from the first mismatch on). The proto returns `breaks[]` — a list — so this
 * also notes when there is more than one.
 */
export function ChainBreakPanel({ verification }: { verification?: ChainVerification }) {
	const breaks = verification?.breaks ?? [];
	const firstBreak = breaks[0];

	// Degrade gracefully: no break data means either the chain is intact or — the
	// real case today — the gateway does not expose VerifyChain yet. Either way,
	// render an honest pending-server note, never a fake result.
	if (!firstBreak) {
		return (
			<div
				data-testid="chain-break-pending"
				className="border-t border-line bg-surface-2 px-4 py-2.5 text-[11.5px] text-fg-2"
			>
				Independent chain re-verification (<code className="font-mono text-fg">VerifyChain</code>)
				is not yet exposed by the REST gateway. When it lands, a tampered entry surfaces here with
				its stored vs. recomputed hash.
			</div>
		);
	}

	const total = verification?.total;
	return (
		<div data-testid="chain-break-panel" className="border-t border-line">
			<div className="flex flex-wrap items-center gap-2.5 px-4 pt-3.5 pb-1">
				<span
					data-testid="chain-break-badge"
					className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--danger)_45%,transparent)] bg-danger-soft px-2.5 py-0.5 font-mono text-[11px] font-semibold text-danger"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						className="h-3.5 w-3.5"
					>
						<path d="M12 3l8 4v5c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z" />
						<path d="M9 9l6 6M15 9l-6 6" />
					</svg>
					chain BROKEN
				</span>
				<span className="font-mono text-[11px] text-fg-3">
					{total !== undefined ? (
						<>
							first mismatch at position <b className="text-fg">{firstBreak.position}</b> of {total}
						</>
					) : (
						<>
							first mismatch at position <b className="text-fg">{firstBreak.position}</b>
						</>
					)}
					{breaks.length > 1 && <> · {breaks.length} breaks total</>}
				</span>
			</div>

			<dl className="px-4 py-2 font-mono text-[11.5px]">
				<HashRow label="entry_id · position">
					<span className="text-fg-2">
						{firstBreak.entryId} · <b className="text-fg">position {firstBreak.position}</b>{" "}
						<span className="text-fg-3">(0-based)</span>
					</span>
				</HashRow>
				{firstBreak.actor && (
					<HashRow label="actor · action">
						<span className="text-fg-2">
							{firstBreak.actor}
							{firstBreak.action ? ` · ${firstBreak.action}` : ""}
						</span>
					</HashRow>
				)}
				<HashRow label="got (entry_hash)">
					<span data-testid="chain-break-got" className="text-danger">
						{shortHash(firstBreak.got)} <span className="text-fg-3">— stored on the entry</span>
					</span>
				</HashRow>
				<HashRow label="want (recomputed)">
					<span data-testid="chain-break-want" className="text-warn">
						{shortHash(firstBreak.want)} <span className="text-fg-3">— SHA-256 of entry</span>
					</span>
				</HashRow>
			</dl>

			<div className="flex items-start gap-2 border-t border-line bg-danger-soft px-4 py-2.5 text-[11.5px] text-fg-2">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className="mt-0.5 h-3.5 w-3.5 flex-none text-danger"
				>
					<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
				</svg>
				<span>
					At <b className="text-fg">position {firstBreak.position}</b> the stored{" "}
					<code className="font-mono text-fg">got</code> hash ≠ the recomputed{" "}
					<code className="font-mono text-fg">want</code> — the audit log was{" "}
					<b className="text-fg">tampered or corrupted</b> here. Everything from this entry on is
					untrusted until investigated.
				</span>
			</div>
		</div>
	);
}

function HashRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-line py-1.5 first:border-t-0">
			<dt className="text-fg-3">{label}</dt>
			<dd className="min-w-0 text-right">{children}</dd>
		</div>
	);
}
