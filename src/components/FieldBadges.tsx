/** Shared badge components for field metadata (deprecated, read-only, etc.). */

export function DeprecatedBadge() {
	return (
		<span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">
			Deprecated
		</span>
	);
}

export function ReadOnlyBadge() {
	return (
		<span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs font-medium text-fg-2">
			Read-only
		</span>
	);
}

export function WriteOnceBadge({ hasValue }: { hasValue?: boolean }) {
	return (
		<span className="rounded bg-lock-soft px-1.5 py-0.5 text-xs font-medium text-lock">
			{hasValue ? "Immutable" : "Write-once"}
		</span>
	);
}

export function SensitiveBadge() {
	return (
		<span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
			Sensitive
		</span>
	);
}

/**
 * The literal redaction the server returns for sensitive (write-only) fields on
 * every read path, for every role — `internal/config/redact.go`. Render as-is:
 * no reveal affordance, no fake masking, no superadmin bypass.
 */
export function RedactedValue() {
	return (
		<span
			title="Write-only — the server returns the literal [REDACTED] on every read path for every role. No reveal."
			className="inline-block rounded bg-warn-soft px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-warn"
		>
			[REDACTED]
		</span>
	);
}
