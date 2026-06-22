import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { components } from "../../api/schema";
import {
	ConflictResolver,
	type FieldConflict,
	type Resolution,
} from "../../components/ConflictResolver";
import { RedactedValue } from "../../components/FieldBadges";
import { formatError, isAbortedConflict } from "../../lib/api-error";
import { useAuth } from "../../lib/auth";
import { fieldTypeIcon, fieldTypeLabel } from "../../lib/field-types";
import { groupFields, typedValueToString } from "../../lib/fields";
import {
	useApiClient,
	useConfig,
	useFieldLocks,
	useSchemaVersion,
	useTenant,
	useTenantNotFoundFallback,
} from "../../lib/hooks";
import { type FieldEditBlock, fieldEditBlock } from "../../lib/permissions";
import { useToast } from "../../lib/toast";
import { constraintHint, validateField } from "../../lib/validation";

type SchemaField = components["schemas"]["v1SchemaField"];
type TypedValue = components["schemas"]["v1TypedValue"];
type FieldType = components["schemas"]["v1FieldType"];
type FieldUpdate = components["schemas"]["v1FieldUpdate"];

/** Encode the editor's string value back into the TypedValue oneof the API expects. */
function stringToTypedValue(value: string, fieldType: FieldType | undefined): TypedValue {
	switch (fieldType) {
		case "FIELD_TYPE_INT":
			return { integerValue: value };
		case "FIELD_TYPE_NUMBER":
			return { numberValue: Number(value) };
		case "FIELD_TYPE_BOOL":
			return { boolValue: value === "true" };
		case "FIELD_TYPE_TIME":
			return { timeValue: value };
		case "FIELD_TYPE_DURATION":
			return { durationValue: value };
		case "FIELD_TYPE_URL":
			return { urlValue: value };
		case "FIELD_TYPE_JSON":
			return { jsonValue: value };
		default:
			return { stringValue: value };
	}
}

/** Human label for the disabled affordance reason. */
const BLOCK_LABEL: Record<FieldEditBlock, string> = {
	role: "no access",
	"read-only": "read-only",
	"write-once": "write-once",
	locked: "locked",
};

/**
 * Tokenized config editor (hi-fi Screen 1) — the product's heart. Replaces the
 * gray TenantDetail editor path. Renders one row per schema field with a typed
 * input, per-constraint live validation, and the full server-authority guard
 * chain (read-only / write-once / locks / sensitive) mirrored client-side.
 *
 * Writes are staged into one atomic SetFields batch carrying each field's
 * expectedChecksum. A stale checksum is rejected with ABORTED, which opens the
 * three-way conflict resolver so the user can rebase onto the fresh version.
 *
 * Rendered by TenantConfig only for editor roles; read-only roles get ReadView,
 * which keeps hook order stable across role changes.
 */
export function ConfigEditor({ tenantId }: { tenantId: string }) {
	const { auth } = useAuth();
	const role = auth.role;
	const client = useApiClient();
	const queryClient = useQueryClient();
	const { toast } = useToast();

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

	const { data: locksData } = useFieldLocks(tenantId);

	const fields = useMemo(() => schema?.fields ?? [], [schema]);
	const configValues = useMemo(() => config?.values ?? [], [config]);

	const serverValueMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const cv of configValues) {
			if (cv.fieldPath) m.set(cv.fieldPath, typedValueToString(cv.value));
		}
		return m;
	}, [configValues]);

	const checksumMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const cv of configValues) {
			if (cv.fieldPath && cv.checksum) m.set(cv.fieldPath, cv.checksum);
		}
		return m;
	}, [configValues]);

	const fieldByPath = useMemo(() => {
		const m = new Map<string, SchemaField>();
		for (const f of fields) {
			if (f.path) m.set(f.path, f);
		}
		return m;
	}, [fields]);

	const lockedFields = useMemo(() => {
		const s = new Set<string>();
		for (const lock of locksData?.locks ?? []) {
			if (lock.fieldPath) s.add(lock.fieldPath);
		}
		return s;
	}, [locksData]);

	const groups = useMemo(() => groupFields(fields), [fields]);

	const [pending, setPending] = useState<Map<string, string>>(new Map());
	const [description, setDescription] = useState("");
	const [showOnlyChanged, setShowOnlyChanged] = useState(false);
	const [conflicts, setConflicts] = useState<FieldConflict[] | null>(null);
	const [conflictVersions, setConflictVersions] = useState<{ stale?: number; fresh?: number }>({});
	const importInputRef = useRef<HTMLInputElement>(null);

	const displayValue = useCallback(
		(path: string): string => {
			if (pending.has(path)) return pending.get(path) as string;
			return serverValueMap.get(path) ?? "";
		},
		[pending, serverValueMap],
	);

	const handleChange = useCallback(
		(path: string, value: string) => {
			const serverValue = serverValueMap.get(path) ?? "";
			setPending((prev) => {
				const next = new Map(prev);
				if (value === serverValue) next.delete(path);
				else next.set(path, value);
				return next;
			});
		},
		[serverValueMap],
	);

	const undo = useCallback((path: string) => {
		setPending((prev) => {
			const next = new Map(prev);
			next.delete(path);
			return next;
		});
	}, []);

	const discardAll = useCallback(() => {
		setPending(new Map());
		setDescription("");
	}, []);

	// Live validation: every staged value is checked against its schema constraints.
	// The first error per path blocks Save; the row renders it inline.
	const errorMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const [path, value] of pending) {
			const f = fieldByPath.get(path);
			if (!f) continue;
			const err = validateField(f, value);
			if (err) m.set(path, err);
		}
		return m;
	}, [pending, fieldByPath]);

	const hasErrors = errorMap.size > 0;
	const pendingCount = pending.size;

	/** Build the FieldUpdate[] for the current staged edits against given checksums. */
	const buildUpdates = useCallback(
		(checksums: Map<string, string>, only?: Set<string>): FieldUpdate[] => {
			const out: FieldUpdate[] = [];
			for (const [fieldPath, value] of pending) {
				if (only && !only.has(fieldPath)) continue;
				const f = fieldByPath.get(fieldPath);
				out.push({
					fieldPath,
					value: stringToTypedValue(value, f?.type),
					expectedChecksum: checksums.get(fieldPath),
				});
			}
			return out;
		},
		[pending, fieldByPath],
	);

	/** POST the batch. Returns nothing on success; throws the API error body on failure. */
	const postBatch = useCallback(
		async (updates: FieldUpdate[]) => {
			const { error: err } = await client.POST("/v1/tenants/{tenantId}/config:batchSet", {
				params: { path: { tenantId } },
				body: { updates, description: description || undefined },
			});
			if (err) throw err;
		},
		[client, tenantId, description],
	);

	/** Re-fetch the latest config and compute the conflicting fields for the resolver. */
	const openConflictResolver = useCallback(async () => {
		const { data, error: err } = await client.GET("/v1/tenants/{tenantId}/config", {
			params: { path: { tenantId } },
		});
		// A failed re-fetch would open the resolver with empty values/checksums; surface
		// the error and abort instead so the user keeps their staged edits intact.
		if (err) {
			toast.error(formatError(err));
			return;
		}
		const fresh = data?.config;
		const freshValues = new Map<string, string>();
		const freshChecks = new Map<string, string>();
		for (const cv of fresh?.values ?? []) {
			if (cv.fieldPath) freshValues.set(cv.fieldPath, typedValueToString(cv.value));
			if (cv.fieldPath && cv.checksum) freshChecks.set(cv.fieldPath, cv.checksum);
		}
		const list: FieldConflict[] = [];
		for (const [path, mine] of pending) {
			const f = fieldByPath.get(path);
			if (!f) continue;
			const theirs = freshValues.get(path) ?? "";
			// Only fields whose committed value moved are real conflicts; re-applying
			// the rest against fresh checksums is enough to clear the ABORTED.
			if (theirs !== (serverValueMap.get(path) ?? "")) {
				list.push({ path, field: f, mine, theirs, freshChecksum: freshChecks.get(path) });
			}
		}
		// If nothing visibly diverged, still rebase every staged field onto fresh checksums.
		if (list.length === 0) {
			for (const [path, mine] of pending) {
				const f = fieldByPath.get(path);
				if (!f) continue;
				list.push({
					path,
					field: f,
					mine,
					theirs: freshValues.get(path) ?? "",
					freshChecksum: freshChecks.get(path),
				});
			}
		}
		setConflictVersions({ stale: config?.version, fresh: fresh?.version });
		setConflicts(list);
	}, [client, tenantId, pending, fieldByPath, serverValueMap, config, toast]);

	const saveMutation = useMutation({
		mutationFn: async () => {
			await postBatch(buildUpdates(checksumMap));
		},
		onSuccess: () => {
			toast.success("Saved — committed as a new config version");
			discardAll();
			queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
			queryClient.invalidateQueries({ queryKey: ["versions", tenantId] });
		},
		onError: async (err: unknown) => {
			if (isAbortedConflict(err)) {
				await openConflictResolver();
				return;
			}
			toast.error(formatError(err));
		},
	});

	// Rebase: re-fetch fresh checksums, re-apply only the "keep mine" fields against
	// them, and re-submit. "take theirs" fields are dropped (the server value wins).
	const rebaseMutation = useMutation({
		mutationFn: async (resolutions: Map<string, Resolution>) => {
			const { data, error: err } = await client.GET("/v1/tenants/{tenantId}/config", {
				params: { path: { tenantId } },
			});
			// Without the fresh checksums a re-submit would carry missing ones; throw so
			// onError surfaces it rather than POSTing against an empty freshChecks map.
			if (err) throw err;
			const freshChecks = new Map<string, string>();
			for (const cv of data?.config?.values ?? []) {
				if (cv.fieldPath && cv.checksum) freshChecks.set(cv.fieldPath, cv.checksum);
			}
			const mineFields = new Set<string>();
			for (const [path, res] of resolutions) {
				if (res === "mine") mineFields.add(path);
			}
			const updates = buildUpdates(freshChecks, mineFields);
			// Nothing to write if every conflict was resolved as "take theirs".
			if (updates.length > 0) await postBatch(updates);
		},
		onSuccess: () => {
			// The write landed (or there was nothing to write): the fresh config is now
			// the source of truth, so clear the whole staging buffer and close the panel.
			discardAll();
			setConflicts(null);
			toast.success("Rebased and saved onto the latest version");
			queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
			queryClient.invalidateQueries({ queryKey: ["versions", tenantId] });
		},
		onError: (err: unknown) => {
			if (isAbortedConflict(err)) {
				toast.error("Still conflicting — the config moved again. Re-open to rebase.");
				return;
			}
			toast.error(formatError(err));
		},
	});

	const exportMutation = useMutation({
		mutationFn: async () => {
			const { data, error: err } = await client.GET("/v1/tenants/{tenantId}/config/export", {
				params: { path: { tenantId } },
			});
			if (err) throw err;
			return data?.yamlContent ?? "";
		},
		onSuccess: (yaml) => {
			const decoded = decodeMaybeBase64(yaml);
			const blob = new Blob([decoded], { type: "application/yaml" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${tenant?.name ?? "config"}.yaml`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success("Exported config");
		},
		onError: (err: unknown) => toast.error(`Export failed: ${formatError(err)}`),
	});

	const importMutation = useMutation({
		mutationFn: async (yamlContent: string) => {
			const { error: err } = await client.POST("/v1/tenants/{tenantId}/config/import", {
				params: { path: { tenantId } },
				body: { yamlContent, mode: "IMPORT_MODE_MERGE" },
			});
			if (err) throw err;
		},
		onSuccess: () => {
			toast.success("Imported config");
			queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
			queryClient.invalidateQueries({ queryKey: ["versions", tenantId] });
		},
		onError: (err: unknown) => toast.error(`Import failed: ${formatError(err)}`),
	});

	const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = ""; // allow re-importing the same file
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = String(reader.result ?? "");
			// The API field is base64 (`format: byte`); openapi-fetch will not encode it.
			importMutation.mutate(btoa(unescape(encodeURIComponent(text))));
		};
		reader.readAsText(file);
	};

	const isLoading = tenantLoading || schemaLoading || configLoading;

	if (isLoading) {
		return <p className="text-sm text-fg-3">Loading config…</p>;
	}
	if (tenantError) {
		return <p className="text-danger">Error: {tenantError.message}</p>;
	}
	if (!tenant) return null;

	const visibleGroups = groups
		.map((g) => ({
			name: g.name,
			fields: showOnlyChanged ? g.fields.filter((f) => pending.has(f.path ?? "")) : g.fields,
		}))
		.filter((g) => g.fields.length > 0);

	return (
		<div data-testid="config-editor" className={pendingCount > 0 ? "pb-28" : ""}>
			{/* Toolbar — scope, filters, import/export */}
			<div className="mb-5 flex flex-wrap items-center gap-3 border-b border-line pb-4">
				<div className="min-w-0">
					<h2 className="text-base font-semibold text-fg">{tenant.name}</h2>
					<p className="mt-0.5 font-mono text-xs text-fg-3">
						{schema ? (
							<>
								{schema.name} v{tenant.schemaVersion}
							</>
						) : (
							<>schema v{tenant.schemaVersion}</>
						)}
						{config && <> · config v{config.version}</>}
						{" · "}
						{fields.length} fields
					</p>
				</div>

				<span className="flex-1" />

				<button
					type="button"
					onClick={() => setShowOnlyChanged((v) => !v)}
					aria-pressed={showOnlyChanged}
					className={`rounded-[var(--r-pill)] border px-3 py-1.5 text-xs ${
						showOnlyChanged
							? "border-accent-line bg-accent-soft text-fg"
							: "border-line-2 border-dashed text-fg-2 hover:bg-surface-2"
					}`}
				>
					changed only
				</button>
				<button
					type="button"
					onClick={() => exportMutation.mutate()}
					disabled={exportMutation.isPending}
					className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-3 disabled:opacity-50"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="h-3.5 w-3.5"
					>
						<path d="M12 3v12m0-12 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
					</svg>
					Export
				</button>
				<button
					type="button"
					onClick={() => importInputRef.current?.click()}
					disabled={importMutation.isPending}
					className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-3 disabled:opacity-50"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="h-3.5 w-3.5"
					>
						<path d="M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
					</svg>
					Import
				</button>
				<input
					ref={importInputRef}
					type="file"
					accept=".yaml,.yml,application/yaml,text/yaml"
					className="hidden"
					aria-label="Import config file"
					onChange={onImportFile}
				/>
			</div>

			{visibleGroups.length === 0 && (
				<p className="text-sm text-fg-3">
					{showOnlyChanged ? "No staged changes." : "This schema defines no fields."}
				</p>
			)}

			<div className="space-y-6">
				{visibleGroups.map((group) => (
					<section key={group.name || "general"}>
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
							{group.fields.map((field) => {
								const path = field.path ?? "";
								const value = displayValue(path);
								const hasValue = (serverValueMap.get(path) ?? "") !== "";
								const block = fieldEditBlock(role, field, {
									hasValue,
									isLocked: lockedFields.has(path),
								});
								return (
									<FieldRow
										key={path}
										field={field}
										value={value}
										serverValue={serverValueMap.get(path) ?? ""}
										checksum={checksumMap.get(path)}
										isDirty={pending.has(path)}
										block={block}
										error={errorMap.get(path)}
										onChange={(v) => handleChange(path, v)}
										onUndo={() => undo(path)}
									/>
								);
							})}
						</div>
					</section>
				))}
			</div>

			{/* Sticky save bar */}
			{pendingCount > 0 && (
				<div className="fixed inset-x-0 bottom-0 z-40 border-t border-line-2 bg-surface shadow-[var(--sh-2)]">
					<div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-3">
						<span className="text-sm font-semibold text-fg">
							<b className="text-accent">{pendingCount}</b> change{pendingCount === 1 ? "" : "s"}{" "}
							staged
						</span>
						<input
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Version note — why this change?"
							aria-label="Version note"
							className="min-w-40 flex-1 rounded-[var(--r-sm)] border border-line-2 bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
						/>
						{hasErrors && (
							<span className="font-mono text-xs text-danger" data-testid="save-blocked-hint">
								{errorMap.size} error{errorMap.size === 1 ? "" : "s"} — fix to save
							</span>
						)}
						<button
							type="button"
							onClick={discardAll}
							disabled={saveMutation.isPending}
							className="rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-surface-3 disabled:opacity-50"
						>
							Discard
						</button>
						<button
							type="button"
							onClick={() => saveMutation.mutate()}
							disabled={hasErrors || saveMutation.isPending}
							className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								className="h-3.5 w-3.5"
							>
								<path d="M5 12l5 5L20 7" />
							</svg>
							{saveMutation.isPending ? "Saving…" : "Save batch"}
						</button>
					</div>
				</div>
			)}

			<ConflictResolver
				open={conflicts !== null}
				staleVersion={conflictVersions.stale}
				freshVersion={conflictVersions.fresh}
				conflicts={conflicts ?? []}
				onCancel={() => setConflicts(null)}
				onRebase={(res) => rebaseMutation.mutate(res)}
				isApplying={rebaseMutation.isPending}
			/>
		</div>
	);
}

interface FieldRowProps {
	field: SchemaField;
	value: string;
	serverValue: string;
	checksum: string | undefined;
	isDirty: boolean;
	block: FieldEditBlock | null;
	error: string | undefined;
	onChange: (value: string) => void;
	onUndo: () => void;
}

function FieldRow({
	field,
	value,
	serverValue,
	checksum,
	isDirty,
	block,
	error,
	onChange,
	onUndo,
}: FieldRowProps) {
	const errorId = useId();
	const hintId = useId();
	const disabled = block !== null;
	const invalid = error !== undefined;

	let stateRing = "border-line bg-surface";
	if (invalid) stateRing = "border-danger bg-danger-soft";
	else if (isDirty) stateRing = "border-accent-line bg-accent-soft";
	else if (field.deprecated) stateRing = "border-line bg-surface opacity-70";

	return (
		<div
			data-testid={`field-${field.path}`}
			className={`grid grid-cols-[2.25rem_1fr_auto] gap-3 rounded-[var(--r-md)] border p-3 ${stateRing}`}
		>
			<span
				title={fieldTypeLabel(field.type)}
				className="flex h-7 w-9 items-center justify-center rounded-[var(--r-sm)] border border-line-2 bg-surface-2 font-mono text-[10px] font-medium text-fg-2"
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
					{field.nullable && (
						<span className="rounded-[var(--r-xs)] border border-dashed border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-3">
							nullable
						</span>
					)}
					{field.deprecated && (
						<span className="rounded-[var(--r-xs)] border border-[color-mix(in_oklch,var(--warn)_35%,transparent)] bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warn">
							deprecated
						</span>
					)}
					{field.sensitive && (
						<span className="rounded-[var(--r-xs)] border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-2">
							sensitive
						</span>
					)}
					{block && <BlockBadge block={block} />}
					{isDirty && (
						<button
							type="button"
							onClick={onUndo}
							className="ml-auto rounded-[var(--r-xs)] px-1.5 py-0.5 font-mono text-[10px] text-accent hover:underline"
						>
							↺ undo
						</button>
					)}
				</div>

				{field.description && <p className="mt-1 text-xs text-fg-2">{field.description}</p>}
				{field.deprecated && field.redirectTo && (
					<p className="mt-1 text-xs text-warn">
						Use <code className="font-mono">{field.redirectTo}</code> instead
					</p>
				)}

				<div className="mt-2">
					{field.sensitive ? (
						<SensitiveInput
							field={field}
							value={value}
							disabled={disabled}
							invalid={invalid}
							errorId={errorId}
							hintId={hintId}
							onChange={onChange}
						/>
					) : block !== null ? (
						<DisabledValue value={serverValue} block={block} />
					) : (
						<TokenInput
							field={field}
							value={value}
							invalid={invalid}
							errorId={errorId}
							hintId={hintId}
							onChange={onChange}
						/>
					)}
				</div>

				<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
					<span id={hintId} className="font-mono text-[11px] text-fg-3">
						{constraintHint(field)}
					</span>
					{field.defaultValue !== undefined && field.defaultValue !== "" && (
						<span className="text-[11px] text-fg-3">
							default <b className="text-fg-2">{field.defaultValue}</b>
						</span>
					)}
					{isDirty && !field.sensitive && (
						<span className="font-mono text-[11px] text-fg-3">
							was <span className="text-fg-3 line-through">{serverValue || "(empty)"}</span> →{" "}
							<span className="text-accent">{value || "(empty)"}</span>
						</span>
					)}
				</div>

				{invalid && (
					<p
						id={errorId}
						role="alert"
						className="mt-2 flex items-center gap-1.5 text-xs text-danger"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3.5 w-3.5 flex-none"
						>
							<circle cx="12" cy="12" r="9" />
							<path d="M12 8v4m0 4h.01" />
						</svg>
						{error}
					</p>
				)}
			</div>

			<div className="text-right font-mono text-[10px] text-fg-3">
				{serverValue !== "" ? <span className="text-fg-2">set</span> : <span>default</span>}
				<div>{checksum ? `✓ ${checksum.slice(0, 6)}` : "—"}</div>
			</div>
		</div>
	);
}

function BlockBadge({ block }: { block: FieldEditBlock }) {
	const isLock = block === "locked";
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-[var(--r-xs)] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
				isLock
					? "border-[color-mix(in_oklch,var(--lock)_35%,transparent)] bg-lock-soft text-lock"
					: "border-line-2 bg-surface-2 text-fg-2"
			}`}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="h-2.5 w-2.5"
			>
				<rect x="5" y="11" width="14" height="9" rx="2" />
				<path d="M8 11V8a4 4 0 0 1 8 0v3" />
			</svg>
			{BLOCK_LABEL[block]}
		</span>
	);
}

/** Frozen affordance for a field the current role can't edit (with the reason). */
function DisabledValue({ value, block }: { value: string; block: FieldEditBlock }) {
	return (
		<span
			data-testid="disabled-value"
			className="inline-flex w-full max-w-md items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-line-2 bg-surface-2 px-3 py-1.5 font-mono text-sm text-fg-2"
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="h-3.5 w-3.5 flex-none text-fg-3"
			>
				<rect x="5" y="11" width="14" height="9" rx="2" />
				<path d="M8 11V8a4 4 0 0 1 8 0v3" />
			</svg>
			<span className="truncate">{value || "not set"}</span>
			<span className="ml-auto font-sans text-[11px] text-fg-3">{BLOCK_LABEL[block]}</span>
		</span>
	);
}

/**
 * Sensitive = write-only. The server hard-redacts the stored value to the literal
 * [REDACTED] on every read for every role, so we never show the current value —
 * only a write-only overwrite input. No bullet-masking, no reveal.
 */
function SensitiveInput({
	field,
	value,
	disabled,
	invalid,
	errorId,
	hintId,
	onChange,
}: {
	field: SchemaField;
	value: string;
	disabled: boolean;
	invalid: boolean;
	errorId: string;
	hintId: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-line-2 bg-surface-2 px-3 py-1.5">
				<span className="font-mono text-[11px] text-fg-3">current</span>
				<RedactedValue />
			</span>
			{!disabled && (
				<input
					type="text"
					aria-label={`Overwrite ${field.title ?? field.path} (write-only)`}
					aria-invalid={invalid}
					aria-describedby={`${hintId}${invalid ? ` ${errorId}` : ""}`}
					value={value}
					placeholder="Type new value to overwrite…"
					onChange={(e) => onChange(e.target.value)}
					className={`w-64 max-w-full rounded-[var(--r-sm)] border bg-surface px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent ${
						invalid ? "border-danger" : "border-line-2"
					}`}
				/>
			)}
		</div>
	);
}

/** Type-appropriate, token-styled input wired to live validation + ARIA. */
function TokenInput({
	field,
	value,
	invalid,
	errorId,
	hintId,
	onChange,
}: {
	field: SchemaField;
	value: string;
	invalid: boolean;
	errorId: string;
	hintId: string;
	onChange: (v: string) => void;
}) {
	const label = field.title ?? field.path ?? "";
	const describedBy = `${hintId}${invalid ? ` ${errorId}` : ""}`;
	const base = `rounded-[var(--r-sm)] border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent ${
		invalid ? "border-danger" : "border-line-2"
	}`;
	const enumValues = field.constraints?.enumValues;

	if (field.type === "FIELD_TYPE_BOOL") {
		const on = value === "true";
		return (
			<label className="inline-flex cursor-pointer items-center gap-2.5">
				<input
					type="checkbox"
					aria-label={label}
					checked={on}
					onChange={(e) => onChange(e.target.checked ? "true" : "false")}
					className="peer sr-only"
				/>
				<span
					className={`relative h-[22px] w-[38px] rounded-[var(--r-pill)] border transition-colors ${
						on ? "border-transparent bg-ok" : "border-line-2 bg-surface-3"
					}`}
				>
					<span
						className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-fg-2 transition-transform ${
							on ? "translate-x-4 bg-white" : ""
						}`}
					/>
				</span>
				<span className="font-mono text-xs text-fg-2">{on ? "true" : "false"}</span>
			</label>
		);
	}

	if (enumValues && enumValues.length > 0) {
		return (
			<select
				aria-label={label}
				aria-invalid={invalid}
				aria-describedby={describedBy}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={`${base} font-mono`}
			>
				<option value="">— select —</option>
				{enumValues.map((v) => (
					<option key={v} value={v}>
						{v}
					</option>
				))}
			</select>
		);
	}

	if (field.type === "FIELD_TYPE_JSON") {
		return (
			<textarea
				aria-label={label}
				aria-invalid={invalid}
				aria-describedby={describedBy}
				rows={3}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={`${base} w-full max-w-md font-mono text-xs`}
			/>
		);
	}

	const type =
		field.type === "FIELD_TYPE_INT" || field.type === "FIELD_TYPE_NUMBER"
			? "number"
			: field.type === "FIELD_TYPE_URL"
				? "url"
				: "text";
	const placeholder =
		field.type === "FIELD_TYPE_DURATION"
			? "e.g. 24h, 90m, 1h30m"
			: field.type === "FIELD_TYPE_TIME"
				? "RFC 3339 — 2025-01-15T09:30:00Z"
				: field.type === "FIELD_TYPE_URL"
					? "https://example.com"
					: field.nullable
						? "Not set — using default"
						: "";

	return (
		<input
			type={type}
			aria-label={label}
			aria-invalid={invalid}
			aria-describedby={describedBy}
			value={value}
			placeholder={placeholder}
			min={field.constraints?.min}
			max={field.constraints?.max}
			onChange={(e) => onChange(e.target.value)}
			className={`${base} w-64 max-w-full font-mono`}
		/>
	);
}

/** YAML export comes back base64-encoded (`format: byte`); decode for the download. */
function decodeMaybeBase64(s: string): string {
	try {
		// Heuristic: valid base64 round-trips. YAML almost never is by accident.
		if (/^[A-Za-z0-9+/=\r\n]+$/.test(s) && s.length % 4 === 0) {
			return decodeURIComponent(escape(atob(s)));
		}
	} catch {
		// fall through — return as-is
	}
	return s;
}
