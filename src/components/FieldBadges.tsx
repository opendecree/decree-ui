/** Shared badge components for field metadata (deprecated, read-only, etc.). */

export function DeprecatedBadge() {
	return (
		<span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
			Deprecated
		</span>
	);
}

export function ReadOnlyBadge() {
	return (
		<span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
			Read-only
		</span>
	);
}

export function WriteOnceBadge({ hasValue }: { hasValue?: boolean }) {
	return (
		<span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
			{hasValue ? "Immutable" : "Write-once"}
		</span>
	);
}

export function SensitiveBadge() {
	return (
		<span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
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
