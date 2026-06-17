import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { components } from "../../api/schema";
import { RedactedValue } from "../../components/FieldBadges";
import { SkeletonDetail } from "../../components/Skeleton";
import { formatError, isRollbackRejected } from "../../lib/api-error";
import { useAuth } from "../../lib/auth";
import type { Role } from "../../lib/constants";
import {
	buildFieldDiffs,
	type ChangeType,
	type FieldDiff,
	predictReguard,
	type ReguardConflict,
} from "../../lib/diff";
import { fieldTypeIcon, fieldTypeLabel } from "../../lib/field-types";
import {
	useApiClient,
	useAuditLog,
	useConfig,
	useFieldLocks,
	useSchemaVersion,
	useTenant,
	useVersions,
} from "../../lib/hooks";
import { canEditConfig } from "../../lib/permissions";
import { useToast } from "../../lib/toast";

type ConfigVersion = components["schemas"]["v1ConfigVersion"];
type AuditEntry = components["schemas"]["v1AuditEntry"];
type SchemaField = components["schemas"]["v1SchemaField"];

/** Initials for an actor avatar — first two letters of the local part ("carol@acme" → "CA"). */
function initials(actor: string): string {
	const local = actor.split("@")[0] || actor;
	return local.slice(0, 2).toUpperCase() || "?";
}

function formatWhen(iso: string | undefined): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleString();
}

/** The action kind for a version, inferred from its description / audit marker. */
type VersionAction = "create" | "rollback" | "set";

/**
 * Tokenized version history + diff (hi-fi Screen 4). A timeline of every
 * `ConfigVersion` (the "why" captured at save), a field-level diff of the
 * selected version against its predecessor, and a guarded rollback.
 *
 * The REST gateway returns no diff model and no historical config snapshot, so
 * the per-version diff is computed client-side from the audit log (the only
 * per-field delta source). Sensitive fields render `[REDACTED]` on both sides —
 * the server never returns their value on any read path, the diff included.
 *
 * Rollback is a write: offered only to config editors (`canEditConfig`) and only
 * on a non-current version. `RollbackToVersion` re-guards every restored field
 * server-side and rejects the whole rollback atomically if any one is locked /
 * read-only / write-once / invalid; this screen mirrors that guard chain (via the
 * same `fieldEditBlock` helper) to warn first, and surfaces the server's atomic
 * rejection — it never bypasses the server's authority.
 */
export function TenantHistory() {
	const { id } = useParams<{ id: string }>();
	const tenantId = id ?? "";
	const { auth } = useAuth();
	const role = auth.role;

	const { data: tenantData, isLoading: tenantLoading, error: tenantError } = useTenant(tenantId);
	const tenant = tenantData?.tenant;

	const { data: schemaData } = useSchemaVersion(tenant?.schemaId ?? "", tenant?.schemaVersion);
	const schema = schemaData?.schema;

	const { data: versionsData, isLoading: versionsLoading } = useVersions(tenantId);
	const { data: configData } = useConfig(tenantId);
	const { data: auditData } = useAuditLog(tenantId);
	const { data: locksData } = useFieldLocks(tenantId);

	const versions = useMemo<ConfigVersion[]>(() => versionsData?.versions ?? [], [versionsData]);
	const currentVersion = configData?.config?.version;

	const fieldByPath = useMemo(() => {
		const m = new Map<string, SchemaField>();
		for (const f of schema?.fields ?? []) {
			if (f.path) m.set(f.path, f);
		}
		return m;
	}, [schema]);

	const lockedPaths = useMemo(() => {
		const s = new Set<string>();
		for (const lock of locksData?.locks ?? []) {
			if (lock.fieldPath) s.add(lock.fieldPath);
		}
		return s;
	}, [locksData]);

	// Audit entries grouped by the version they produced — the diff source.
	const entriesByVersion = useMemo(() => {
		const m = new Map<number, AuditEntry[]>();
		for (const e of auditData?.entries ?? []) {
			if (e.configVersion === undefined) continue;
			const list = m.get(e.configVersion) ?? [];
			list.push(e);
			m.set(e.configVersion, list);
		}
		return m;
	}, [auditData]);

	// Fields currently holding a value — drives the write-once re-guard prediction.
	const currentValuePaths = useMemo(() => {
		const s = new Set<string>();
		for (const cv of configData?.config?.values ?? []) {
			if (cv.fieldPath) s.add(cv.fieldPath);
		}
		return s;
	}, [configData]);

	// Default the selected version to the newest one.
	const [selected, setSelected] = useState<number | null>(null);
	const sortedVersions = useMemo(
		() => [...versions].sort((a, b) => (b.version ?? 0) - (a.version ?? 0)),
		[versions],
	);
	const effectiveSelected = selected ?? sortedVersions[0]?.version ?? currentVersion ?? null;

	const selectedVersion = useMemo(
		() => sortedVersions.find((v) => v.version === effectiveSelected),
		[sortedVersions, effectiveSelected],
	);

	const diffs = useMemo<FieldDiff[]>(() => {
		if (effectiveSelected === null) return [];
		return buildFieldDiffs(entriesByVersion.get(effectiveSelected) ?? [], fieldByPath);
	}, [effectiveSelected, entriesByVersion, fieldByPath]);

	const isCurrent = effectiveSelected === currentVersion;
	const showRollback = canEditConfig(role) && !isCurrent && effectiveSelected !== null;

	// The fields a rollback to `selected` would re-write = those whose value at
	// the target version differs from current. Resolve each field's value at the
	// target by walking the audit deltas at-or-before that version (newest wins).
	const restoredValues = useMemo(() => {
		const m = new Map<string, string>();
		if (effectiveSelected === null) return m;
		// Walk every audit entry up to and including the target version, newest
		// first, recording the first (most recent) value seen per field.
		const upToTarget = (auditData?.entries ?? [])
			.filter((e) => e.fieldPath && (e.configVersion ?? 0) <= effectiveSelected)
			.sort((a, b) => (b.configVersion ?? 0) - (a.configVersion ?? 0));
		const seen = new Set<string>();
		const targetValues = new Map<string, string | null>();
		for (const e of upToTarget) {
			const path = e.fieldPath as string;
			if (seen.has(path)) continue;
			seen.add(path);
			targetValues.set(path, e.newValue ?? null);
		}
		// Current resolved values, for the "differs from current" narrowing.
		const currentValues = new Map<string, string>();
		for (const cv of configData?.config?.values ?? []) {
			if (cv.fieldPath) currentValues.set(cv.fieldPath, valueString(cv));
		}
		for (const [path, targetVal] of targetValues) {
			if (targetVal === null) continue; // removed/never-set at target
			if (currentValues.get(path) !== targetVal) m.set(path, targetVal);
		}
		return m;
	}, [effectiveSelected, auditData, configData]);

	const reguardConflicts = useMemo<ReguardConflict[]>(
		() =>
			predictReguard(role, restoredValues, fieldByPath, lockedPaths, (p) =>
				currentValuePaths.has(p),
			),
		[role, restoredValues, fieldByPath, lockedPaths, currentValuePaths],
	);

	const client = useApiClient();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const [confirmTarget, setConfirmTarget] = useState<number | null>(null);
	const [note, setNote] = useState("");
	const [rejection, setRejection] = useState<string | null>(null);

	const rollbackMutation = useMutation({
		mutationFn: async (version: number) => {
			const { error } = await client.POST("/v1/tenants/{tenantId}/versions/{version}:rollback", {
				params: {
					path: { tenantId, version },
					query: note ? { description: note } : {},
				},
			});
			if (error) throw error;
		},
		onSuccess: () => {
			setConfirmTarget(null);
			setNote("");
			setRejection(null);
			setSelected(null); // jump back to newest (the new rollback version)
			queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
			queryClient.invalidateQueries({ queryKey: ["versions", tenantId] });
			queryClient.invalidateQueries({ queryKey: ["audit", tenantId] });
			toast.success("Rollback committed — chain extended, audit entry recorded.");
		},
		onError: (err: unknown) => {
			if (isRollbackRejected(err)) {
				// Atomic re-guard rejection: nothing was written. Surface it in the
				// modal rather than as a transient toast so the reason stays readable.
				setRejection(formatError(err));
				return;
			}
			toast.error(`Rollback failed: ${formatError(err)}`);
		},
	});

	const openConfirm = useCallback(() => {
		if (effectiveSelected === null) return;
		setRejection(null);
		setNote("");
		setConfirmTarget(effectiveSelected);
	}, [effectiveSelected]);

	const isLoading = tenantLoading || versionsLoading;
	if (isLoading) return <SkeletonDetail />;
	if (tenantError) return <p className="text-danger">Error: {tenantError.message}</p>;
	if (!tenant) return null;

	return (
		<div data-testid="tenant-history" className="flex flex-col gap-5">
			{/* Header */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-4">
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 text-base font-semibold text-fg">
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-4 w-4 text-fg-3"
						>
							<path d="M12 8v4l3 2" />
							<circle cx="12" cy="12" r="9" />
						</svg>
						Version history
					</h2>
					<p className="mt-0.5 font-mono text-xs text-fg-3">
						{tenant.name}
						{schema && (
							<>
								{" · "}
								{schema.name} v{tenant.schemaVersion}
							</>
						)}
						{currentVersion !== undefined && <> · config v{currentVersion}</>}
						{" · "}
						{versions.length} version{versions.length === 1 ? "" : "s"}
					</p>
				</div>
			</div>

			{versions.length === 0 ? (
				<p className="text-sm text-fg-3">No versions yet.</p>
			) : (
				<div className="flex flex-col gap-5 lg:flex-row">
					{/* Timeline */}
					<aside className="w-full shrink-0 lg:w-80">
						<div className="mb-3 flex items-center gap-2">
							<h3 className="text-sm font-semibold text-fg">Timeline</h3>
							<span className="font-mono text-xs text-fg-3">{versions.length}</span>
						</div>
						<ol className="space-y-1.5" data-testid="version-timeline">
							{sortedVersions.map((v) => (
								<TimelineItem
									key={v.version}
									version={v}
									action={actionOf(v)}
									isCurrent={v.version === currentVersion}
									isSelected={v.version === effectiveSelected}
									onSelect={() => setSelected(v.version ?? null)}
								/>
							))}
						</ol>
					</aside>

					{/* Diff pane */}
					<section className="min-w-0 flex-1" data-testid="diff-pane">
						<DiffHeader
							selectedVersion={selectedVersion}
							isEarliest={
								effectiveSelected === Math.min(...sortedVersions.map((v) => v.version ?? 0))
							}
							changeCount={diffs.length}
							showRollback={showRollback}
							onRollback={openConfirm}
						/>
						<DiffBody diffs={diffs} />
					</section>
				</div>
			)}

			{confirmTarget !== null && (
				<RollbackModal
					targetVersion={confirmTarget}
					newVersion={(sortedVersions[0]?.version ?? confirmTarget) + 1}
					changeCount={restoredValues.size}
					role={role}
					reguardConflicts={reguardConflicts}
					rejection={rejection}
					note={note}
					onNote={setNote}
					isPending={rollbackMutation.isPending}
					onCancel={() => {
						setConfirmTarget(null);
						setRejection(null);
					}}
					onConfirm={() => rollbackMutation.mutate(confirmTarget)}
				/>
			)}
		</div>
	);
}

/** Resolve a config value to its display string (the set member of the oneof). */
function valueString(cv: components["schemas"]["v1ConfigValue"]): string {
	const v = cv.value;
	if (!v) return "";
	if (v.stringValue !== undefined) return v.stringValue;
	if (v.integerValue !== undefined) return String(v.integerValue);
	if (v.numberValue !== undefined) return String(v.numberValue);
	if (v.boolValue !== undefined) return String(v.boolValue);
	if (v.timeValue !== undefined) return v.timeValue;
	if (v.durationValue !== undefined) return v.durationValue;
	if (v.urlValue !== undefined) return v.urlValue;
	if (v.jsonValue !== undefined) return v.jsonValue;
	return "";
}

/** Infer a version's action kind from its description (audit marker) text. */
function actionOf(v: ConfigVersion): VersionAction {
	const desc = (v.description ?? "").toLowerCase();
	if (v.version === 1 || desc.includes("initial")) return "create";
	if (desc.includes("rollback") || desc.includes("roll back")) return "rollback";
	return "set";
}

const ACTION_STYLE: Record<VersionAction, { dot: string; badge: string }> = {
	create: {
		dot: "border-ok bg-ok-soft text-ok",
		badge: "border-[color-mix(in_oklch,var(--ok)_35%,transparent)] bg-ok-soft text-ok",
	},
	rollback: {
		dot: "border-warn bg-warn-soft text-warn",
		badge: "border-[color-mix(in_oklch,var(--warn)_35%,transparent)] bg-warn-soft text-warn",
	},
	set: {
		dot: "border-line-2 bg-surface-2 text-fg-2",
		badge: "border-line-2 bg-surface-2 text-fg-2",
	},
};

function TimelineItem({
	version,
	action,
	isCurrent,
	isSelected,
	onSelect,
}: {
	version: ConfigVersion;
	action: VersionAction;
	isCurrent: boolean;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const style = ACTION_STYLE[action];
	const actor = version.createdBy ?? "unknown";
	return (
		<li>
			<button
				type="button"
				onClick={onSelect}
				aria-pressed={isSelected}
				data-testid={`version-${version.version}`}
				className={`flex w-full gap-3 rounded-[var(--r-md)] border p-2.5 text-left ${
					isSelected
						? "border-accent-line bg-accent-soft"
						: "border-line bg-surface hover:bg-surface-2"
				}`}
			>
				<span
					className={`grid h-8 w-9 flex-none place-items-center rounded-[var(--r-sm)] border font-mono text-[11px] font-semibold ${style.dot}`}
					aria-hidden="true"
				>
					v{version.version}
				</span>
				<span className="min-w-0 flex-1">
					<span className="flex items-center gap-1.5">
						<span className="text-sm font-medium text-fg">Version {version.version}</span>
						{isCurrent && (
							<span className="rounded-[var(--r-pill)] bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
								current
							</span>
						)}
						<span className="ml-auto whitespace-nowrap text-[11px] text-fg-3">
							{formatWhen(version.createdAt)}
						</span>
					</span>
					{version.description && (
						<span className="mt-0.5 block truncate text-xs text-fg-2">{version.description}</span>
					)}
					<span className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-3">
						<span
							className="grid h-4 w-4 flex-none place-items-center rounded-full bg-accent-soft font-mono text-[8px] font-semibold text-accent"
							aria-hidden="true"
						>
							{initials(actor)}
						</span>
						<span className="truncate">{actor}</span>
						{action !== "set" && (
							<span
								className={`ml-auto rounded-[var(--r-xs)] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${style.badge}`}
							>
								{action}
							</span>
						)}
					</span>
				</span>
			</button>
		</li>
	);
}

function DiffHeader({
	selectedVersion,
	isEarliest,
	changeCount,
	showRollback,
	onRollback,
}: {
	selectedVersion: ConfigVersion | undefined;
	isEarliest: boolean;
	changeCount: number;
	showRollback: boolean;
	onRollback: () => void;
}) {
	const target = selectedVersion?.version;
	const baseLabel = isEarliest ? "∅" : `v${(target ?? 1) - 1}`;
	const baseSub = isEarliest ? "initial" : "base";
	return (
		<div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-line bg-surface-2 px-3 py-2.5">
			<div className="flex items-center gap-2">
				<span className="flex flex-col items-center rounded-[var(--r-sm)] border border-line bg-surface px-2.5 py-1">
					<span className="font-mono text-sm font-semibold text-fg">{baseLabel}</span>
					<span className="font-mono text-[9px] uppercase tracking-wide text-fg-3">{baseSub}</span>
				</span>
				<span className="text-fg-3" aria-hidden="true">
					→
				</span>
				<span className="flex flex-col items-center rounded-[var(--r-sm)] border border-accent-line bg-accent-soft px-2.5 py-1">
					<span className="font-mono text-sm font-semibold text-fg">v{target}</span>
					<span className="font-mono text-[9px] uppercase tracking-wide text-fg-3">compare</span>
				</span>
			</div>
			<span className="font-mono text-xs text-fg-2" data-testid="diff-summary">
				<b className="text-fg">{changeCount}</b> field{changeCount === 1 ? "" : "s"} changed
			</span>
			<span className="flex-1" />
			{showRollback && (
				<button
					type="button"
					onClick={onRollback}
					data-testid="rollback-button"
					className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-3"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="h-3.5 w-3.5"
					>
						<path d="M9 14 4 9l5-5" />
						<path d="M4 9h11a6 6 0 0 1 0 12h-3" />
					</svg>
					Roll back to this
				</button>
			)}
		</div>
	);
}

function DiffBody({ diffs }: { diffs: FieldDiff[] }) {
	if (diffs.length === 0) {
		return (
			<div
				data-testid="diff-empty"
				className="flex flex-col items-center gap-2 rounded-[var(--r-md)] border border-dashed border-line py-12 text-fg-3"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className="h-6 w-6"
				>
					<path d="M5 12l5 5L20 7" />
				</svg>
				<p className="text-sm">No field changes between these versions.</p>
			</div>
		);
	}
	return (
		<div className="space-y-2">
			{diffs.map((d) => (
				<DiffRow key={d.path} diff={d} />
			))}
		</div>
	);
}

const CHANGE_STYLE: Record<ChangeType, string> = {
	added: "border-[color-mix(in_oklch,var(--ok)_35%,transparent)] bg-ok-soft text-ok",
	removed: "border-[color-mix(in_oklch,var(--danger)_35%,transparent)] bg-danger-soft text-danger",
	modified: "border-accent-line bg-accent-soft text-accent",
};

function DiffRow({ diff }: { diff: FieldDiff }) {
	const title = diff.path
		.split(".")
		.pop()
		?.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return (
		<div
			data-testid={`diff-${diff.path}`}
			className="grid grid-cols-[2.25rem_1fr] gap-3 rounded-[var(--r-md)] border border-line bg-surface p-3"
		>
			<span
				title={fieldTypeLabel(diff.fieldType)}
				className="flex h-7 w-9 items-center justify-center rounded-[var(--r-sm)] border border-line-2 bg-surface-2 font-mono text-[10px] font-medium text-fg-2"
			>
				{diff.fieldType ? fieldTypeIcon(diff.fieldType) : "·"}
			</span>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium text-fg">{title}</span>
					<code className="font-mono text-xs text-fg-3">{diff.path}</code>
					<span
						className={`rounded-[var(--r-xs)] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${CHANGE_STYLE[diff.changeType]}`}
					>
						{diff.changeType}
					</span>
					{diff.sensitive && (
						<span className="inline-flex items-center gap-1 rounded-[var(--r-xs)] border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-2">
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								className="h-2.5 w-2.5"
							>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
								<circle cx="12" cy="12" r="2.5" />
							</svg>
							sensitive
						</span>
					)}
				</div>
				<div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
					<DiffValue side="old" diff={diff} />
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="h-4 w-4 text-fg-3"
					>
						<path d="M5 12h14M13 6l6 6-6 6" />
					</svg>
					<DiffValue side="new" diff={diff} />
				</div>
			</div>
		</div>
	);
}

function DiffValue({ side, diff }: { side: "old" | "new"; diff: FieldDiff }) {
	const isEmpty =
		(side === "old" && diff.changeType === "added") ||
		(side === "new" && diff.changeType === "removed");
	const raw = side === "old" ? diff.oldValue : diff.newValue;

	const tone =
		side === "old"
			? "border-line bg-surface-2"
			: diff.changeType === "removed"
				? "border-line bg-surface-2"
				: "border-accent-line bg-accent-soft";

	return (
		<div
			data-testid={`diff-${diff.path}-${side}`}
			className={`flex min-w-0 items-center gap-2 overflow-hidden rounded-[var(--r-sm)] border px-2.5 py-1.5 ${tone}`}
		>
			<span className="font-mono text-[9px] uppercase tracking-wide text-fg-3">
				{side === "old" ? "old" : "new"}
			</span>
			{isEmpty ? (
				<span className="font-mono text-xs text-fg-3 italic">
					{side === "old" ? "did not exist" : "removed"}
				</span>
			) : diff.sensitive ? (
				// Sensitive: never reveal either side — the server hard-redacts on every
				// read path, the diff included. Render [REDACTED] on both sides.
				<RedactedValue />
			) : raw === null ? (
				<span className="font-mono text-xs text-fg-3">null</span>
			) : (
				<code className="truncate font-mono text-xs text-fg">{raw}</code>
			)}
		</div>
	);
}

const BLOCK_REASON: Record<ReguardConflict["block"], string> = {
	role: "no access",
	"read-only": "read-only",
	"write-once": "write-once",
	locked: "locked",
	invalid: "invalid under current schema",
};

function RollbackModal({
	targetVersion,
	newVersion,
	changeCount,
	role,
	reguardConflicts,
	rejection,
	note,
	onNote,
	isPending,
	onCancel,
	onConfirm,
}: {
	targetVersion: number;
	newVersion: number;
	changeCount: number;
	role: Role;
	reguardConflicts: ReguardConflict[];
	rejection: string | null;
	note: string;
	onNote: (v: string) => void;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const willReject = reguardConflicts.length > 0;
	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Roll back to version ${targetVersion}`}
			data-testid="rollback-modal"
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
			<div
				role="presentation"
				className="absolute inset-0 bg-black/40"
				onClick={isPending ? undefined : onCancel}
			/>
			<div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--r-lg)] border border-line-2 bg-surface shadow-[var(--sh-2)]">
				<header className="flex items-start gap-3 border-b border-line px-5 py-4">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="mt-0.5 h-5 w-5 flex-none text-warn"
					>
						<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
					</svg>
					<h2 className="text-sm font-semibold text-fg">
						Roll back to <span className="font-mono">v{targetVersion}</span>?
					</h2>
				</header>

				<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-xs text-fg-2">
					<p>
						This creates a <b className="font-semibold text-fg">new version</b> (
						<span className="font-mono">v{newVersion}</span>) whose values match{" "}
						<span className="font-mono">v{targetVersion}</span> — history is never rewritten, and
						the rollback itself is recorded in the audit chain.{" "}
						<b className="font-semibold text-fg">{changeCount}</b> field
						{changeCount === 1 ? "" : "s"} will change from the current version.
					</p>
					<p className="flex items-start gap-2 text-fg-3">
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="mt-0.5 h-3.5 w-3.5 flex-none"
						>
							<path d="M12 3l8 4v5c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z" />
						</svg>
						<span>
							Each restored field is <b className="font-semibold text-fg-2">re-guarded</b> against
							current rules (locks, read-only, write-once, validity). If any fails, the whole
							rollback is <b className="font-semibold text-fg-2">rejected atomically</b> — nothing
							is written.
						</span>
					</p>

					{/* Server's atomic rejection (final authority) takes precedence. */}
					{rejection ? (
						<div
							data-testid="rollback-rejected"
							className="flex items-start gap-2 rounded-[var(--r-sm)] border border-[color-mix(in_oklch,var(--danger)_45%,transparent)] bg-danger-soft px-3 py-2.5 text-danger"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								className="mt-0.5 h-4 w-4 flex-none"
							>
								<circle cx="12" cy="12" r="9" />
								<path d="M12 8v4m0 4h.01" />
							</svg>
							<span>
								<b className="block font-semibold">Rollback rejected — nothing written.</b>
								<span className="text-fg-2">
									The server re-guarded the restored fields and refused the whole write. {rejection}
								</span>
							</span>
						</div>
					) : willReject ? (
						// Client-side mirror of the guard chain — a heads-up before the round-trip.
						<div
							data-testid="rollback-warning"
							className="rounded-[var(--r-sm)] border border-[color-mix(in_oklch,var(--warn)_30%,transparent)] bg-warn-soft px-3 py-2.5 text-warn"
						>
							<span className="flex items-start gap-2">
								<svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									className="mt-0.5 h-4 w-4 flex-none"
								>
									<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
								</svg>
								<span>
									This rollback will likely be <b className="font-semibold">rejected atomically</b>{" "}
									— the following restored field{reguardConflicts.length === 1 ? " is" : "s are"}{" "}
									guarded under current rules
									{role === "admin" ? " (a superadmin can bypass locks)" : ""}:
								</span>
							</span>
							<ul className="mt-2 space-y-1">
								{reguardConflicts.map((c) => (
									<li key={c.path} className="flex items-center gap-2 font-mono text-[11px]">
										<code className="text-fg-2">{c.path}</code>
										<span className="rounded-[var(--r-xs)] border border-[color-mix(in_oklch,var(--warn)_35%,transparent)] px-1.5 py-0.5 uppercase tracking-wide">
											{BLOCK_REASON[c.block]}
										</span>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<input
						value={note}
						onChange={(e) => onNote(e.target.value)}
						placeholder={`Version note — why roll back? (recorded on v${newVersion})`}
						aria-label="Rollback version note"
						className="w-full rounded-[var(--r-sm)] border border-line-2 bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
					/>
				</div>

				<footer className="flex items-center gap-2 border-t border-line px-5 py-3">
					<span className="flex-1" />
					<button
						type="button"
						onClick={onCancel}
						disabled={isPending}
						className="rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-3 disabled:opacity-50"
					>
						{rejection ? "Close" : "Cancel"}
					</button>
					{!rejection && (
						<button
							type="button"
							onClick={onConfirm}
							disabled={isPending}
							className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-50"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								className="h-3.5 w-3.5"
							>
								<path d="M9 14 4 9l5-5" />
								<path d="M4 9h11a6 6 0 0 1 0 12h-3" />
							</svg>
							{isPending ? "Rolling back…" : "Create rollback version"}
						</button>
					)}
				</footer>
			</div>
		</div>
	);
}
