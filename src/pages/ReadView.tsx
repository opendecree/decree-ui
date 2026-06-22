import { useCallback, useMemo, useState } from "react";
import type { components } from "../api/schema";
import {
	DeprecatedBadge,
	ReadOnlyBadge,
	RedactedValue,
	SensitiveBadge,
} from "../components/FieldBadges";
import { SkeletonDetail } from "../components/Skeleton";
import { fieldTypeColor, fieldTypeIcon, fieldTypeLabel } from "../lib/field-types";
import { formatDuration, groupFields, typedValueToString } from "../lib/fields";
import {
	useAuditLog,
	useConfig,
	useSchemaVersion,
	useTenant,
	useTenantNotFoundFallback,
} from "../lib/hooks";
import { type FieldProvenance, resolveFieldProvenance } from "../lib/provenance";
import {
	changeToAuditEntry,
	streamTouchedPaths,
	streamValueOverlay,
	useConfigStream,
} from "../lib/useConfigStream";

type SchemaField = components["schemas"]["v1SchemaField"];
type FieldType = components["schemas"]["v1FieldType"];
type AuditEntry = components["schemas"]["v1AuditEntry"];

/** Initials for an actor avatar — first two letters of the local part ("carol@acme" → "CA"). */
function initials(actor: string): string {
	const local = actor.split("@")[0] || actor;
	return local.slice(0, 2).toUpperCase() || "?";
}

function timeAgo(iso: string): string {
	if (!iso) return "";
	const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/**
 * App-operator read view: the resolved config values for a tenant, plus a feed of
 * recent changes. Entry point for the `user` role — read-only by construction, so
 * it carries zero write affordances (absent, not disabled). Reuses the same data
 * hooks and field utilities as the admin editor.
 */
export function ReadView({ tenantId }: { tenantId: string }) {
	const [showDeprecated, setShowDeprecated] = useState(false);

	const { data: tenantData, isLoading: tenantLoading, error: tenantError } = useTenant(tenantId);
	useTenantNotFoundFallback(tenantId, tenantError);
	const tenant = tenantData?.tenant;

	const { data: schemaData, isLoading: schemaLoading } = useSchemaVersion(
		tenant?.schemaId ?? "",
		tenant?.schemaVersion,
	);
	const schema = schemaData?.schema;

	const { data: configData, isLoading: configLoading } = useConfig(tenantId);
	const config = configData?.config;

	const { data: auditData } = useAuditLog(tenantId);

	// Live config subscription (server `Subscribe` RPC via the gateway). It is the
	// live path; the query hooks above remain the fallback — when the stream can't
	// open or errors, `status` is "fallback" and the read view runs on query data.
	const { changes, status } = useConfigStream(tenantId);
	const isLive = status === "live";

	const fields = useMemo(() => schema?.fields ?? [], [schema]);

	// Sensitive (write-only) field paths. The server redacts these on the value path,
	// but the changes feed renders old→new deltas raw — so the feed must redact them
	// too, lest a streamed (or audited) delta leak a value the value pane hides.
	const sensitivePaths = useMemo(() => {
		const s = new Set<string>();
		for (const f of fields) if (f.sensitive && f.path) s.add(f.path);
		return s;
	}, [fields]);

	// Streamed deltas overlaid on the polled data: live values win over query values,
	// touched paths drop their now-stale checksum, and live changes are adapted to
	// the audit-entry shape so the recent-changes feed renders them with one renderer.
	const valueOverlay = useMemo(() => streamValueOverlay(changes), [changes]);
	const touchedPaths = useMemo(() => streamTouchedPaths(changes), [changes]);
	const liveEntries = useMemo(() => changes.map((c) => changeToAuditEntry(c)), [changes]);

	// Live entries are newest-first already; prepend them to the polled audit log so
	// provenance and the feed both see the most recent change first.
	const entries = useMemo(
		() => [...liveEntries, ...(auditData?.entries ?? [])],
		[liveEntries, auditData],
	);

	const valueMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const cv of config?.values ?? []) {
			if (cv.fieldPath) m.set(cv.fieldPath, typedValueToString(cv.value));
		}
		// Overlay live values: a string overrides, an explicit-null clear removes the
		// value (so the row reads as a stored null via the audit-derived provenance).
		for (const [path, value] of valueOverlay) {
			if (value === null) m.delete(path);
			else m.set(path, value);
		}
		return m;
	}, [config, valueOverlay]);

	const checksumMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const cv of config?.values ?? []) {
			if (cv.fieldPath && cv.checksum) m.set(cv.fieldPath, cv.checksum);
		}
		// The change event carries no checksum, so a live-updated field's old checksum
		// is stale — drop it rather than show a value that no longer matches.
		for (const path of touchedPaths) m.delete(path);
		return m;
	}, [config, touchedPaths]);

	// Per-field provenance: classifies each field as set / explicit-null / unset
	// from its value presence + the audit log (the only source that distinguishes a
	// deliberate clear from a never-set field). Computed per field in the row.
	const provenanceFor = useCallback(
		(path: string): FieldProvenance => resolveFieldProvenance(path, valueMap.has(path), entries),
		[valueMap, entries],
	);

	const groups = useMemo(() => groupFields(fields), [fields]);
	const setCount = fields.filter((f) => valueMap.has(f.path ?? "")).length;

	const isLoading = tenantLoading || schemaLoading || configLoading;

	if (isLoading) return <SkeletonDetail />;
	if (tenantError) return <p className="text-danger">Error: {tenantError.message}</p>;
	if (!tenant) return null;

	return (
		<div data-testid="read-view">
			{/* Read banner */}
			<div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--r-lg)] border border-line bg-surface-2 px-4 py-3 text-sm text-fg-2">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className="h-4 w-4 text-fg-3"
				>
					<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
					<circle cx="12" cy="12" r="2.5" />
				</svg>
				<span>
					<b className="font-semibold text-fg">What is set right now</b> for{" "}
					<b className="font-semibold text-fg">{tenant.name}</b>
					{schema && (
						<>
							{" "}
							on{" "}
							<code className="font-mono text-xs text-fg-2">
								{schema.name} v{tenant.schemaVersion}
							</code>
						</>
					)}
					{config && <> — config v{config.version}.</>}{" "}
					{isLive
						? "Values stream live; you're viewing, not editing."
						: "You're viewing, not editing."}
				</span>
				{isLive && <LiveDot className="ml-auto" />}
				<span
					className={`rounded-[var(--r-pill)] border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-2 ${isLive ? "" : "ml-auto"}`}
				>
					read-only
				</span>
			</div>

			<div className="flex flex-col gap-6 lg:flex-row">
				{/* Values pane */}
				<div className="min-w-0 flex-1">
					<div className="mb-3 flex items-center gap-3">
						<h2 className="text-sm font-semibold text-fg">Values</h2>
						<span className="font-mono text-xs text-fg-3">
							{fields.length} fields · {setCount} set
						</span>
						<button
							type="button"
							onClick={() => setShowDeprecated((v) => !v)}
							className="ml-auto rounded-[var(--r-sm)] border border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-surface-2"
						>
							{showDeprecated ? "hide deprecated" : "show deprecated"}
						</button>
					</div>

					{groups.length === 0 && <p className="text-fg-3">This schema defines no fields.</p>}

					<div className="space-y-6">
						{groups.map((group) => {
							const visible = group.fields.filter((f) => !f.deprecated || showDeprecated);
							if (visible.length === 0) return null;
							return (
								<section key={group.name}>
									{group.name && (
										<div className="mb-2 flex items-center gap-2">
											<span className="font-mono text-xs uppercase tracking-wide text-fg-3">
												{group.name}
											</span>
											<span className="text-xs text-fg-3">{group.fields.length}</span>
											<span className="h-px flex-1 bg-line" />
										</div>
									)}
									<div className="space-y-2">
										{visible.map((field) => (
											<ValueRow
												key={field.path}
												field={field}
												value={valueMap.get(field.path ?? "")}
												checksum={checksumMap.get(field.path ?? "")}
												provenance={provenanceFor(field.path ?? "")}
												live={touchedPaths.has(field.path ?? "")}
											/>
										))}
									</div>
								</section>
							);
						})}
					</div>
				</div>

				{/* Recent changes feed */}
				<aside className="w-full shrink-0 lg:w-80">
					<div className="mb-3 flex items-center gap-2">
						<h2 className="text-sm font-semibold text-fg">Recent changes</h2>
						{isLive && <LiveDot className="ml-auto" />}
					</div>
					<div className="space-y-1.5">
						{entries.length === 0 && <p className="text-xs text-fg-3">No recorded changes yet.</p>}
						{entries.map((e, i) => (
							<FeedItem
								key={e.id}
								entry={e}
								live={isLive && i < liveEntries.length}
								sensitive={!!e.fieldPath && sensitivePaths.has(e.fieldPath)}
							/>
						))}
					</div>
					{entries.length > 0 && (
						<p className="mt-3 font-mono text-[11px] text-fg-3">
							{isLive ? (
								<>
									streaming via <span className="text-fg-2">Subscribe</span> · {entries.length}{" "}
									entries · audited
								</>
							) : (
								<>{entries.length} recent entries · audited</>
							)}
						</p>
					)}
				</aside>
			</div>
		</div>
	);
}

/**
 * The "live" connection indicator — a pulsing `ok`-toned dot. Shown in the banner
 * and the feed head only while the `Subscribe` stream is open; in fallback (refetch)
 * mode it is absent, so the dot is an honest signal that values are streaming.
 */
function LiveDot({ className = "" }: { className?: string }) {
	return (
		<span
			data-testid="live-indicator"
			className={`inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok ${className}`}
		>
			<span className="relative flex h-1.5 w-1.5" aria-hidden="true">
				<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75 motion-reduce:hidden" />
				<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
			</span>
			live
		</span>
	);
}

/** A small "live" pill marking a row/feed item touched by a live stream event. */
function LiveBadge() {
	return (
		<span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] bg-ok-soft px-1.5 py-0.5 font-mono text-[10px] font-medium text-ok">
			<span className="h-1 w-1 rounded-full bg-ok" aria-hidden="true" />
			live
		</span>
	);
}

function ValueRow({
	field,
	value,
	checksum,
	provenance,
	live = false,
}: {
	field: SchemaField;
	value: string | undefined;
	checksum: string | undefined;
	provenance: FieldProvenance;
	live?: boolean;
}) {
	const isSet = provenance.state === "set";
	const isExplicitNull = provenance.state === "explicit-null";
	return (
		<div
			data-testid={`value-${field.path}`}
			data-live={live ? "true" : undefined}
			className={`grid grid-cols-[2.25rem_1fr_auto] gap-3 rounded-[var(--r-md)] border bg-surface p-3 transition-colors duration-700 ${
				live ? "border-ok/50 bg-ok-soft" : "border-line"
			} ${field.deprecated ? "opacity-70" : ""}`}
		>
			<span
				title={fieldTypeLabel(field.type)}
				className={`flex h-7 w-9 items-center justify-center rounded-[var(--r-sm)] text-xs font-bold ${fieldTypeColor(field.type)}`}
			>
				{fieldTypeIcon(field.type)}
			</span>

			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					{field.title ? (
						<>
							<span className="text-sm font-medium text-fg">{field.title}</span>
							<code className="font-mono text-xs text-fg-3">{field.path}</code>
						</>
					) : (
						<code className="font-mono text-sm font-medium text-fg">{field.path}</code>
					)}
					{field.readOnly && <ReadOnlyBadge />}
					{field.sensitive && <SensitiveBadge />}
					{field.deprecated && <DeprecatedBadge />}
					{live && <LiveBadge />}
					{field.nullable && !isSet && (
						<span className="rounded border border-dashed border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-3">
							nullable
						</span>
					)}
					{/* Explicit null and unset read differently — a stored null is a value. */}
					{isExplicitNull ? (
						<span
							data-testid={`null-badge-${field.path}`}
							className="rounded border border-dashed border-warn/40 bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warn"
						>
							null
						</span>
					) : (
						!isSet && (
							<span className="rounded border border-dashed border-line px-1.5 py-0.5 text-xs text-fg-3">
								unset
							</span>
						)
					)}
				</div>
				{field.description && <p className="mt-1 text-xs text-fg-2">{field.description}</p>}
				{field.deprecated && field.redirectTo && (
					<p className="mt-1 text-xs text-warn">
						Use <code className="font-mono">{field.redirectTo}</code> instead
					</p>
				)}
				<div className="mt-1.5">
					<ReadValue
						value={value}
						fieldType={field.type}
						sensitive={field.sensitive}
						explicitNull={isExplicitNull}
					/>
				</div>
			</div>

			<div className="text-right text-xs whitespace-nowrap text-fg-3">
				{isSet ? (
					<span className="text-ok">
						set{provenance.version ? ` · v${provenance.version}` : ""}
					</span>
				) : isExplicitNull ? (
					// Provenance distinguishes a deliberate clear from "default".
					<span className="text-warn">
						set · null{provenance.version ? ` · v${provenance.version}` : ""}
					</span>
				) : (
					<span>default</span>
				)}
				{!isSet && !isExplicitNull && (
					<div className="font-mono text-[10px] text-fg-3">provenance: default</div>
				)}
				{provenance.actor && (
					<div className="text-fg-3">
						{isExplicitNull ? "cleared by " : ""}
						{provenance.actor}
						{provenance.time && <> · {timeAgo(provenance.time)}</>}
					</div>
				)}
				<div className="font-mono text-fg-3">{checksum ? `✓ ${checksum.slice(0, 6)}` : "—"}</div>
			</div>
		</div>
	);
}

function ReadValue({
	value,
	fieldType,
	sensitive,
	explicitNull,
}: {
	value: string | undefined;
	fieldType?: FieldType;
	sensitive?: boolean;
	explicitNull?: boolean;
}) {
	// Sensitive = write-only. The server already returns the literal [REDACTED];
	// render it as-is for every role — no reveal, no fake masking.
	if (sensitive) {
		return (
			<span className="inline-flex flex-wrap items-center gap-2">
				<RedactedValue />
				<span className="font-mono text-[11px] text-fg-3">
					write-only · never returned by the API
				</span>
			</span>
		);
	}
	// Explicit null overrides the schema default — read it as a stored null, not
	// as "resolving to default" (the unset case below).
	if (explicitNull) {
		return (
			<span className="text-sm text-fg-2">
				<code className="font-mono">null</code>{" "}
				<span className="text-fg-3 italic">— overrides the schema default</span>
			</span>
		);
	}
	if (value === undefined || value === "") {
		return <span className="text-sm text-fg-3 italic">Not set — resolving to schema default</span>;
	}
	if (fieldType === "FIELD_TYPE_BOOL") {
		const on = value === "true";
		return (
			<span
				className={`inline-flex items-center gap-1.5 rounded-[var(--r-pill)] px-2 py-0.5 text-xs font-medium ${
					on ? "bg-ok-soft text-ok" : "border border-line text-fg-2"
				}`}
			>
				<span
					className={`h-1.5 w-1.5 rounded-full ${on ? "bg-ok" : "bg-fg-3"}`}
					aria-hidden="true"
				/>
				{value}
			</span>
		);
	}
	if (fieldType === "FIELD_TYPE_URL") {
		return (
			<a
				href={value}
				target="_blank"
				rel="noopener noreferrer"
				className="text-sm break-all text-accent hover:underline"
			>
				{value}
			</a>
		);
	}
	if (fieldType === "FIELD_TYPE_JSON") {
		return (
			<pre className="overflow-auto rounded-[var(--r-sm)] bg-surface-2 p-2 font-mono text-xs text-fg-2">
				{value}
			</pre>
		);
	}
	if (fieldType === "FIELD_TYPE_DURATION") {
		return <span className="text-sm text-fg">{formatDuration(value)}</span>;
	}
	return <span className="text-sm text-fg">{value}</span>;
}

function FeedItem({
	entry,
	live = false,
	sensitive = false,
}: {
	entry: AuditEntry;
	live?: boolean;
	sensitive?: boolean;
}) {
	const isRollback = entry.action === "rollback";
	return (
		<div
			data-live={live ? "true" : undefined}
			className={`flex gap-2.5 rounded-[var(--r-md)] border bg-surface p-2.5 ${
				live ? "border-ok/50 bg-ok-soft" : "border-line"
			}`}
		>
			<span
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent"
				aria-hidden="true"
			>
				{initials(entry.actor ?? "?")}
			</span>
			<div className="min-w-0 flex-1 text-xs">
				<div className="flex items-center gap-1.5">
					<b className="font-semibold text-fg">{entry.actor}</b>
					<span className="text-fg-3">{entry.action}</span>
					{live && <LiveBadge />}
					<span className="ml-auto text-fg-3">{timeAgo(entry.createdAt ?? "")}</span>
				</div>
				<div className="mt-0.5 text-fg-2">
					{isRollback ? (
						<>
							restored config to <code className="font-mono">{entry.newValue}</code>
						</>
					) : entry.fieldPath ? (
						<>
							set <code className="font-mono">{entry.fieldPath}</code>
							{sensitive ? (
								// Write-only field: never surface the old/new delta, even live.
								<>
									{" "}
									<RedactedValue />
								</>
							) : (
								entry.oldValue !== undefined &&
								entry.newValue !== undefined && (
									<>
										{" "}
										<span className="text-fg-3 line-through">{entry.oldValue}</span> →{" "}
										<span className="text-fg">{entry.newValue}</span>
									</>
								)
							)}
						</>
					) : (
						entry.action
					)}
				</div>
				{entry.configVersion !== undefined && (
					<div className="mt-0.5 font-mono text-[11px] text-fg-3">→ v{entry.configVersion}</div>
				)}
			</div>
		</div>
	);
}
