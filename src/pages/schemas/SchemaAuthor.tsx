import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useId, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { components } from "../../api/schema";
import { SkeletonDetail } from "../../components/Skeleton";
import { formatError } from "../../lib/api-error";
import { useAuth } from "../../lib/auth";
import { fieldTypeIcon, fieldTypeLabel } from "../../lib/field-types";
import { groupFields } from "../../lib/fields";
import { useApiClient, useSchema } from "../../lib/hooks";
import { canManageSchemas } from "../../lib/permissions";
import {
	buildUpdateBody,
	constraintKind,
	type DependentRule,
	diffFields,
	duplicatePaths,
	FIELD_TYPE_ORDER,
	FLAG_DEFS,
	isDirty,
	isRuleComplete,
	newFieldDraft,
	summarizeRule,
	validateFieldDef,
} from "../../lib/schema-authoring";
import { useToast } from "../../lib/toast";

type SchemaField = components["schemas"]["v1SchemaField"];
type FieldConstraints = components["schemas"]["v1FieldConstraints"];
type FieldType = components["schemas"]["v1FieldType"];

const RULES_KEY = "@rules";

/**
 * Route wrapper: gate the schema-authoring workbench to superadmin. Defining
 * typed fields/constraints is a global, platform-level capability, so this screen
 * does not exist for admin/user (who enter *values* against a published schema,
 * never author one). A non-superadmin who reaches the URL gets a clear refusal,
 * not a disabled editor. Keeping the gate in a wrapper keeps the inner workbench's
 * hook order stable (no role-conditional hooks).
 */
export function SchemaAuthor() {
	const { auth } = useAuth();
	if (!canManageSchemas(auth.role)) {
		return (
			<div data-testid="schema-author-denied" className="mx-auto max-w-lg py-16 text-center">
				<h2 className="text-lg font-semibold text-fg">Not available</h2>
				<p className="mt-2 text-sm text-fg-2">
					Authoring schema definitions is a superadmin-only, platform-level capability.
				</p>
				<Link to="/schemas" className="mt-4 inline-block text-sm text-accent hover:underline">
					&larr; Back to schemas
				</Link>
			</div>
		);
	}
	return <SchemaWorkbench />;
}

/** The authoring workbench itself — only mounted for superadmin. */
function SchemaWorkbench() {
	const { id } = useParams<{ id: string }>();
	const schemaId = id ?? "";
	const { data, isLoading, error } = useSchema(schemaId);
	const client = useApiClient();
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const schema = data?.schema;
	const published = schema?.published ?? false;
	const version = schema?.version ?? 1;

	// The server's latest version is the baseline the draft is diffed against.
	const baseline = useMemo<SchemaField[]>(() => schema?.fields ?? [], [schema]);

	// Local working copy of the field definitions. Seeded from the server once
	// loaded; edits stay client-side until Save draft round-trips via UpdateSchema.
	const [draft, setDraft] = useState<SchemaField[] | null>(null);
	const fields = draft ?? baseline;

	// Seed the draft the first time the schema arrives (or after a reset).
	if (draft === null && schema) {
		setDraft(baseline.map((f) => ({ ...f, constraints: { ...(f.constraints ?? {}) } })));
	}

	const [selected, setSelected] = useState<string>("");
	const [versionNote, setVersionNote] = useState("");
	const [newFieldSeq, setNewFieldSeq] = useState(1);
	const [showPublish, setShowPublish] = useState(false);
	// dependent_required rules — authored client-side only (see degradation note).
	const [rules, setRules] = useState<DependentRule[]>([]);

	const diff = useMemo(() => diffFields(fields, baseline), [fields, baseline]);
	const dirty = isDirty(diff);
	const dupes = useMemo(() => duplicatePaths(fields), [fields]);

	const errorByPath = useMemo(() => {
		const m = new Map<string, string>();
		for (const f of fields) {
			const p = f.path ?? "";
			if (dupes.has(p.trim())) m.set(p, "Duplicate path — each field path must be unique.");
			const err = validateFieldDef(f);
			if (err && !m.has(p)) m.set(p, err);
		}
		return m;
	}, [fields, dupes]);

	const hasErrors = errorByPath.size > 0;

	const updateField = useCallback((path: string, patch: Partial<SchemaField>) => {
		setDraft((prev) => (prev ?? []).map((f) => (f.path === path ? { ...f, ...patch } : f)));
		// Editing the path renames the field's identity; keep the selection on it so
		// the editor (and its error panel, keyed on the selected path) stays open.
		if (patch.path !== undefined && patch.path !== path) {
			setSelected((cur) => (cur === path ? (patch.path ?? cur) : cur));
		}
	}, []);

	const updateConstraints = useCallback((path: string, patch: Partial<FieldConstraints>) => {
		setDraft((prev) =>
			(prev ?? []).map((f) =>
				f.path === path ? { ...f, constraints: { ...(f.constraints ?? {}), ...patch } } : f,
			),
		);
	}, []);

	const addField = useCallback(() => {
		const f = newFieldDraft(newFieldSeq);
		setNewFieldSeq((n) => n + 1);
		setDraft((prev) => [...(prev ?? []), f]);
		setSelected(f.path ?? "");
	}, [newFieldSeq]);

	const deleteField = useCallback((path: string) => {
		setDraft((prev) => (prev ?? []).filter((f) => f.path !== path));
		setSelected((cur) => (cur === path ? "" : cur));
	}, []);

	const resetDraft = useCallback(() => {
		setDraft(baseline.map((f) => ({ ...f, constraints: { ...(f.constraints ?? {}) } })));
		setVersionNote("");
		setSelected("");
	}, [baseline]);

	// Save draft = UpdateSchema (PATCH). The server creates a NEW draft version
	// from the latest; it never edits a published version in place.
	const saveMutation = useMutation({
		mutationFn: async () => {
			const body = buildUpdateBody(fields, baseline, versionNote);
			const { data: res, error: err } = await client.PATCH("/v1/schemas/{id}", {
				params: { path: { id: schemaId } },
				body,
			});
			if (err) throw err;
			return res;
		},
		onSuccess: (res) => {
			const v = res?.schema?.version;
			toast.success(v ? `Saved — draft v${v} created` : "Saved draft");
			setDraft(null); // re-seed from the refreshed server baseline
			setVersionNote("");
			queryClient.invalidateQueries({ queryKey: ["schemas", schemaId] });
			queryClient.invalidateQueries({ queryKey: ["schemas"] });
		},
		onError: (err: unknown) => toast.error(`Save failed: ${formatError(err)}`),
	});

	// Publish = PublishSchema. Freezes the version permanently; does NOT rebind
	// any tenant — existing tenants stay on their bound version until migrated.
	const publishMutation = useMutation({
		mutationFn: async () => {
			const { error: err } = await client.POST("/v1/schemas/{id}/publish", {
				params: { path: { id: schemaId } },
				body: { version },
			});
			if (err) throw err;
		},
		onSuccess: () => {
			setShowPublish(false);
			toast.success(`Published v${version} — now immutable`);
			queryClient.invalidateQueries({ queryKey: ["schemas", schemaId] });
			queryClient.invalidateQueries({ queryKey: ["schemas"] });
		},
		onError: (err: unknown) => {
			setShowPublish(false);
			toast.error(`Publish failed: ${formatError(err)}`);
		},
	});

	// Fork a published version into a new draft: an empty-delta UpdateSchema spawns
	// the next version (carry-forward), which lands as an editable draft.
	const forkMutation = useMutation({
		mutationFn: async () => {
			const { data: res, error: err } = await client.PATCH("/v1/schemas/{id}", {
				params: { path: { id: schemaId } },
				body: { versionDescription: `Draft from v${version}` },
			});
			if (err) throw err;
			return res;
		},
		onSuccess: (res) => {
			toast.success(`New draft v${res?.schema?.version ?? version + 1} created`);
			setDraft(null);
			queryClient.invalidateQueries({ queryKey: ["schemas", schemaId] });
			queryClient.invalidateQueries({ queryKey: ["schemas"] });
		},
		onError: (err: unknown) => toast.error(`Could not fork: ${formatError(err)}`),
	});

	if (isLoading) return <SkeletonDetail />;
	if (error) {
		return (
			<p className="text-danger" data-testid="schema-author-error">
				Error loading schema: {error.message}
			</p>
		);
	}
	if (!schema) return null;

	const typeCount = new Set(fields.map((f) => f.type)).size;
	const selectedField = fields.find((f) => f.path === selected) ?? null;

	return (
		<div data-testid="schema-author-page" className="min-w-0">
			{/* Topbar: breadcrumb + lifecycle actions */}
			<div className="mb-4 flex flex-wrap items-center gap-3">
				<div className="min-w-0">
					<Link to={`/schemas/${schemaId}`} className="text-xs text-accent hover:underline">
						&larr; Back to {schema.name}
					</Link>
					<h1 className="mt-1 text-lg font-semibold text-fg">
						Schema authoring{" "}
						<span className="font-mono text-sm font-normal text-fg-3">{schema.name}</span>
					</h1>
				</div>

				<span className="flex-1" />

				{dirty && !published && (
					<span className="font-mono text-[11px] text-warn" data-testid="dirty-note">
						● unsaved
					</span>
				)}
				{!published && (
					<button
						type="button"
						onClick={() => saveMutation.mutate()}
						disabled={!dirty || hasErrors || saveMutation.isPending}
						className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
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
						{saveMutation.isPending ? "Saving…" : "Save draft"}
					</button>
				)}
				{!published && (
					<button
						type="button"
						onClick={() => setShowPublish(true)}
						disabled={dirty || hasErrors}
						title={dirty ? "Save the draft before publishing" : undefined}
						className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-ok px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3.5 w-3.5"
						>
							<path d="M12 19V5M5 12l7-7 7 7" />
						</svg>
						Publish v{version}
					</button>
				)}
				{published && (
					<button
						type="button"
						onClick={() => forkMutation.mutate()}
						disabled={forkMutation.isPending}
						className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-50"
						data-testid="fork-btn"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3.5 w-3.5"
						>
							<path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9" />
						</svg>
						{forkMutation.isPending ? "Forking…" : "New draft"}
					</button>
				)}
			</div>

			{/* Lifecycle bar */}
			<LifecycleBar
				schema={schema}
				diff={diff}
				dirty={dirty}
				onReset={dirty ? resetDraft : undefined}
			/>

			<div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
				{/* Field list */}
				<aside className="min-w-0 rounded-[var(--r-md)] border border-line bg-surface">
					<div className="flex items-center justify-between border-b border-line px-3 py-2.5">
						<h2 className="text-sm font-semibold text-fg">Fields</h2>
						<span className="font-mono text-[11px] text-fg-3" data-testid="field-count">
							{fields.length} · {typeCount} type{typeCount === 1 ? "" : "s"}
						</span>
					</div>
					{!published && (
						<div className="border-b border-line px-3 py-2">
							<button
								type="button"
								onClick={addField}
								className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--r-sm)] border border-dashed border-line-2 px-3 py-1.5 text-xs font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"
								data-testid="add-field"
							>
								<svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									className="h-3.5 w-3.5"
								>
									<path d="M12 5v14M5 12h14" />
								</svg>
								Add field
							</button>
						</div>
					)}
					<FieldList
						fields={fields}
						selected={selected}
						errorByPath={errorByPath}
						onSelect={setSelected}
					/>
				</aside>

				{/* Editor */}
				<section className="min-w-0">
					{published && <ImmutableBanner version={version} onFork={() => forkMutation.mutate()} />}

					{selected === RULES_KEY ? (
						<DependentRulesEditor
							fields={fields}
							rules={rules}
							readOnly={published}
							onChange={setRules}
						/>
					) : selectedField ? (
						<FieldEditor
							key={selected}
							field={selectedField}
							readOnly={published}
							error={errorByPath.get(selected)}
							onChangeField={(patch) => updateField(selected, patch)}
							onChangeConstraints={(patch) => updateConstraints(selected, patch)}
							onDelete={() => deleteField(selected)}
						/>
					) : (
						<EmptyEditor onAdd={published ? undefined : addField} />
					)}
				</section>
			</div>

			{showPublish && (
				<PublishModal
					name={schema.name ?? "schema"}
					version={version}
					pending={publishMutation.isPending}
					onCancel={() => setShowPublish(false)}
					onConfirm={(note) => {
						setVersionNote(note);
						publishMutation.mutate();
					}}
				/>
			)}
		</div>
	);
}

// --- Lifecycle bar -----------------------------------------------------------

function LifecycleBar({
	schema,
	diff,
	dirty,
	onReset,
}: {
	schema: components["schemas"]["v1Schema"];
	diff: ReturnType<typeof diffFields>;
	dirty: boolean;
	onReset?: () => void;
}) {
	const published = schema.published ?? false;
	const version = schema.version ?? 1;
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-line bg-surface-2 px-3 py-2.5">
			<span className="rounded-[var(--r-pill)] border border-line-2 bg-surface-3 px-2 py-0.5 font-mono text-[11px] text-fg-2">
				{schema.name}
			</span>
			<span
				className={`inline-flex items-center gap-1.5 rounded-[var(--r-pill)] px-2.5 py-0.5 font-mono text-[11px] ${
					published
						? "bg-ok-soft text-ok"
						: "border border-dashed border-accent-line bg-accent-soft text-accent"
				}`}
				data-testid="lifecycle-state"
			>
				v{version} · {published ? "published" : "draft"}
			</span>
			{schema.parentVersion !== undefined && (
				<span className="font-mono text-[11px] text-fg-3">forked from v{schema.parentVersion}</span>
			)}

			<span className="flex-1" />

			{dirty && (
				<span className="font-mono text-[11px] text-fg-3" data-testid="diff-summary">
					+{diff.added.length} added · ~{diff.modified.length} changed · −{diff.removed.length}{" "}
					removed
				</span>
			)}
			{onReset && (
				<button
					type="button"
					onClick={onReset}
					className="rounded-[var(--r-xs)] px-2 py-0.5 font-mono text-[11px] text-accent hover:underline"
				>
					↺ discard changes
				</button>
			)}
			<span
				className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${published ? "text-fg-2" : "text-fg-3"}`}
			>
				{published ? (
					<>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3 w-3"
						>
							<rect x="5" y="11" width="14" height="9" rx="2" />
							<path d="M8 11V8a4 4 0 0 1 8 0v3" />
						</svg>
						immutable
					</>
				) : (
					"editable"
				)}
			</span>
		</div>
	);
}

// --- Field list --------------------------------------------------------------

const FLAG_DOT: Partial<Record<string, string>> = {
	readOnly: "read-only",
	writeOnce: "write-once",
	sensitive: "sensitive",
	deprecated: "deprecated",
	nullable: "nullable",
};

function FieldList({
	fields,
	selected,
	errorByPath,
	onSelect,
}: {
	fields: SchemaField[];
	selected: string;
	errorByPath: Map<string, string>;
	onSelect: (path: string) => void;
}) {
	const groups = useMemo(() => groupFields(fields), [fields]);
	return (
		<div className="max-h-[60vh] overflow-y-auto py-1">
			{groups.map((group) => (
				<div key={group.name || "general"}>
					<div className="px-3 pt-2 pb-1 font-mono text-[9px] uppercase tracking-widest text-fg-3">
						{group.name || "general"}
					</div>
					{group.fields.map((f) => {
						const path = f.path ?? "";
						const isSel = path === selected;
						const invalid = errorByPath.has(path);
						const flags = Object.entries(FLAG_DOT).filter(
							([k]) => (f as Record<string, unknown>)[k],
						);
						return (
							<button
								type="button"
								key={path}
								onClick={() => onSelect(path)}
								data-testid={`field-item-${path}`}
								className={`flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left ${
									isSel ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2"
								}`}
							>
								<span
									title={fieldTypeLabel(f.type)}
									className="flex h-5 w-7 flex-none items-center justify-center rounded-[var(--r-xs)] border border-line-2 bg-surface-2 font-mono text-[9px] text-fg-2"
								>
									{fieldTypeIcon(f.type)}
								</span>
								<span className="min-w-0 flex-1">
									{f.title && <span className="block truncate text-[13px] text-fg">{f.title}</span>}
									<span className="block truncate font-mono text-[10px] text-fg-3">{path}</span>
								</span>
								{invalid && (
									<span
										title="This field has an error"
										className="h-1.5 w-1.5 flex-none rounded-full bg-danger"
										data-testid={`field-error-dot-${path}`}
									/>
								)}
								<span className="flex flex-none gap-0.5">
									{flags.map(([k]) => (
										<span key={k} title={k} className="h-1.5 w-1.5 rounded-full bg-fg-3" />
									))}
								</span>
							</button>
						);
					})}
				</div>
			))}

			{/* Cross-field rules entry */}
			<button
				type="button"
				onClick={() => onSelect(RULES_KEY)}
				data-testid="field-item-rules"
				className={`mt-1 flex w-full items-center gap-2 border-t border-line border-l-2 px-3 py-2 text-left ${
					selected === RULES_KEY
						? "border-l-accent bg-accent-soft"
						: "border-l-transparent hover:bg-surface-2"
				}`}
			>
				<span className="flex h-5 w-7 flex-none items-center justify-center rounded-[var(--r-xs)] border border-line-2 bg-surface-2 font-mono text-[11px] text-fg-2">
					⚿
				</span>
				<span className="min-w-0 flex-1">
					<span className="block text-[13px] text-fg">Cross-field rules</span>
					<span className="block font-mono text-[10px] text-fg-3">dependent_required</span>
				</span>
			</button>
		</div>
	);
}

// --- Immutable banner --------------------------------------------------------

function ImmutableBanner({ version, onFork }: { version: number; onFork: () => void }) {
	return (
		<div
			data-testid="immutable-banner"
			className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-line-2 bg-surface-2 px-3 py-2.5"
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="h-4 w-4 flex-none text-fg-2"
			>
				<rect x="5" y="11" width="14" height="9" rx="2" />
				<path d="M8 11V8a4 4 0 0 1 8 0v3" />
			</svg>
			<span className="min-w-0 flex-1 text-xs text-fg-2">
				<b className="text-fg">v{version} is published — immutable.</b> Definitions can't be edited
				in place; changes spawn a new draft version. Publishing does not rebind existing tenants.
			</span>
			<button
				type="button"
				onClick={onFork}
				className="rounded-[var(--r-sm)] border border-line-2 bg-surface px-3 py-1 text-xs font-medium text-fg hover:bg-surface-3"
			>
				New draft
			</button>
		</div>
	);
}

// --- Field editor ------------------------------------------------------------

function FieldEditor({
	field,
	readOnly,
	error,
	onChangeField,
	onChangeConstraints,
	onDelete,
}: {
	field: SchemaField;
	readOnly: boolean;
	error: string | undefined;
	onChangeField: (patch: Partial<SchemaField>) => void;
	onChangeConstraints: (patch: Partial<FieldConstraints>) => void;
	onDelete: () => void;
}) {
	return (
		<div data-testid="field-editor" className="space-y-4">
			{error && (
				<p
					role="alert"
					data-testid="field-editor-error"
					className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-danger bg-danger-soft px-3 py-2 text-xs text-danger"
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

			{/* 1. Identity & type */}
			<Section num={1} title="Identity & type">
				<Row label="Title" sub="human label">
					<input
						aria-label="Title"
						disabled={readOnly}
						value={field.title ?? ""}
						placeholder="e.g. Fee Rate"
						onChange={(e) => onChangeField({ title: e.target.value })}
						className={inputCls(readOnly)}
					/>
				</Row>
				<Row label="Path" sub="dotted key">
					<input
						aria-label="Path"
						disabled={readOnly}
						value={field.path ?? ""}
						placeholder="payments.fee_rate"
						onChange={(e) => onChangeField({ path: e.target.value })}
						className={`${inputCls(readOnly)} font-mono`}
					/>
				</Row>
				<Row label="Type" sub="8 supported">
					<TypePicker
						value={field.type}
						readOnly={readOnly}
						onChange={(t) => onChangeField({ type: t, constraints: {} })}
					/>
				</Row>
			</Section>

			{/* 2. Constraints (type-adaptive) */}
			<Section
				num={2}
				title="Constraints"
				hint={`type-specific · ${fieldTypeLabel(field.type).toLowerCase()}`}
			>
				<ConstraintEditor field={field} readOnly={readOnly} onChange={onChangeConstraints} />
			</Section>

			{/* 3. Metadata */}
			<Section num={3} title="Metadata">
				<Row label="Description" sub="">
					<textarea
						aria-label="Description"
						disabled={readOnly}
						rows={2}
						value={field.description ?? ""}
						onChange={(e) => onChangeField({ description: e.target.value })}
						className={`${inputCls(readOnly)} w-full`}
					/>
				</Row>
				<Row label="Format" sub="hint, e.g. percentage / uri">
					<input
						aria-label="Format"
						disabled={readOnly}
						value={field.format ?? ""}
						placeholder="none"
						onChange={(e) => onChangeField({ format: e.target.value })}
						className={`${inputCls(readOnly)} font-mono`}
					/>
				</Row>
				<Row label="Example" sub="sample value">
					<input
						aria-label="Example"
						disabled={readOnly}
						value={field.example ?? ""}
						onChange={(e) => onChangeField({ example: e.target.value })}
						className={`${inputCls(readOnly)} font-mono`}
					/>
				</Row>
				<Row label="Tags" sub="comma-separated grouping">
					<input
						aria-label="Tags"
						disabled={readOnly}
						value={(field.tags ?? []).join(", ")}
						placeholder="payments, billing"
						onChange={(e) =>
							onChangeField({
								tags: e.target.value
									.split(",")
									.map((t) => t.trim())
									.filter((t) => t !== ""),
							})
						}
						className={`${inputCls(readOnly)} font-mono`}
					/>
				</Row>
				<Row label="Default" sub="used when unset">
					<input
						aria-label="Default"
						disabled={readOnly}
						value={field.defaultValue ?? ""}
						placeholder="(no default)"
						onChange={(e) => onChangeField({ defaultValue: e.target.value })}
						className={`${inputCls(readOnly)} font-mono`}
					/>
				</Row>
			</Section>

			{/* 4. Flags */}
			<Section num={4} title="Flags" hint="drive the field states in the config editor">
				<FlagsGrid field={field} readOnly={readOnly} onChange={onChangeField} />
			</Section>

			{!readOnly && (
				<div className="pt-1">
					<button
						type="button"
						onClick={onDelete}
						data-testid="delete-field"
						className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[color-mix(in_oklch,var(--danger)_35%,transparent)] bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger hover:brightness-105"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3.5 w-3.5"
						>
							<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
						</svg>
						Delete field
					</button>
				</div>
			)}
		</div>
	);
}

// --- Type picker -------------------------------------------------------------

function TypePicker({
	value,
	readOnly,
	onChange,
}: {
	value: FieldType | undefined;
	readOnly: boolean;
	onChange: (t: FieldType) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{FIELD_TYPE_ORDER.map((t) => {
				const on = t === value;
				return (
					<button
						type="button"
						key={t}
						disabled={readOnly}
						aria-pressed={on}
						onClick={() => onChange(t)}
						data-testid={`type-${t}`}
						className={`inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
							on
								? "border-accent-line bg-accent-soft text-fg"
								: "border-line-2 text-fg-2 hover:bg-surface-2"
						}`}
					>
						<span className="font-mono text-[10px] text-fg-3">{fieldTypeIcon(t)}</span>
						{fieldTypeLabel(t).toLowerCase()}
					</button>
				);
			})}
		</div>
	);
}

// --- Constraint editor (adaptive) -------------------------------------------

function ConstraintEditor({
	field,
	readOnly,
	onChange,
}: {
	field: SchemaField;
	readOnly: boolean;
	onChange: (patch: Partial<FieldConstraints>) => void;
}) {
	const c = field.constraints ?? {};
	const kind = constraintKind(field.type);

	const numInput = (
		key: "min" | "max" | "minLength" | "maxLength",
		label: string,
		placeholder: string,
	) => (
		<input
			aria-label={label}
			disabled={readOnly}
			type="number"
			value={c[key] ?? ""}
			placeholder={placeholder}
			onChange={(e) =>
				onChange({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })
			}
			className={`${inputCls(readOnly)} w-28 font-mono`}
		/>
	);

	if (kind === "numeric") {
		return (
			<>
				<Row label="Minimum" sub={field.type === "FIELD_TYPE_INT" ? "integer" : "float"}>
					<div className="flex items-center gap-3">
						{numInput("min", "Minimum", "—")}
						<Toggle
							label="exclusive"
							checked={c.exclusiveMin !== undefined}
							disabled={readOnly}
							onChange={(on) => onChange({ exclusiveMin: on ? (c.min ?? 0) : undefined })}
						/>
					</div>
				</Row>
				<Row label="Maximum" sub="">
					<div className="flex items-center gap-3">
						{numInput("max", "Maximum", "—")}
						<Toggle
							label="exclusive"
							checked={c.exclusiveMax !== undefined}
							disabled={readOnly}
							onChange={(on) => onChange({ exclusiveMax: on ? (c.max ?? 0) : undefined })}
						/>
					</div>
				</Row>
			</>
		);
	}

	if (kind === "string") {
		return (
			<>
				<Row label="Length" sub="min / max chars">
					<div className="flex items-center gap-2">
						{numInput("minLength", "Minimum length", "min")}
						<span className="text-fg-3">–</span>
						{numInput("maxLength", "Maximum length", "max")}
					</div>
				</Row>
				<Row label="Pattern" sub="regex (RE2)">
					<input
						aria-label="Pattern"
						disabled={readOnly}
						value={c.regex ?? ""}
						placeholder="^…$"
						onChange={(e) => onChange({ regex: e.target.value })}
						className={`${inputCls(readOnly)} w-full font-mono`}
					/>
				</Row>
				<Row label="Enum" sub="allowed values">
					<ChipSet
						values={c.enumValues ?? []}
						readOnly={readOnly}
						placeholder="add value"
						onChange={(vals) => onChange({ enumValues: vals.length > 0 ? vals : undefined })}
						testid="enum-chips"
					/>
				</Row>
			</>
		);
	}

	if (kind === "duration") {
		return (
			<>
				<Row label="Minimum" sub="seconds">
					{numInput("min", "Minimum", "e.g. 3600")}
				</Row>
				<Row label="Maximum" sub="seconds">
					{numInput("max", "Maximum", "e.g. 2592000")}
				</Row>
			</>
		);
	}

	if (kind === "url") {
		return (
			<Row label="Enum" sub="restrict to specific URLs (optional)">
				<ChipSet
					values={c.enumValues ?? []}
					readOnly={readOnly}
					placeholder="https://…"
					onChange={(vals) => onChange({ enumValues: vals.length > 0 ? vals : undefined })}
					testid="url-enum-chips"
				/>
			</Row>
		);
	}

	if (kind === "json") {
		return (
			<Row label="JSON Schema" sub="validates the value">
				<textarea
					aria-label="JSON Schema"
					disabled={readOnly}
					rows={6}
					value={c.jsonSchema ?? ""}
					placeholder='{ "type": "object" }'
					onChange={(e) => onChange({ jsonSchema: e.target.value })}
					className={`${inputCls(readOnly)} w-full font-mono text-xs`}
				/>
			</Row>
		);
	}

	return (
		<p className="text-xs text-fg-3" data-testid="no-constraints">
			{field.type === "FIELD_TYPE_BOOL"
				? "Booleans take no constraints."
				: field.type === "FIELD_TYPE_TIME"
					? "Times are validated as RFC 3339; no structural constraints."
					: "This type takes no structural constraints."}
		</p>
	);
}

// --- Flags grid --------------------------------------------------------------

function FlagsGrid({
	field,
	readOnly,
	onChange,
}: {
	field: SchemaField;
	readOnly: boolean;
	onChange: (patch: Partial<SchemaField>) => void;
}) {
	return (
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
			{FLAG_DEFS.map((fd) => {
				const on = !!(field as Record<string, unknown>)[fd.key];
				return (
					<div
						key={fd.key}
						data-testid={`flag-${fd.key}`}
						className={`rounded-[var(--r-sm)] border p-2.5 ${
							on ? "border-accent-line bg-accent-soft" : "border-line-2 bg-surface"
						}`}
					>
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0">
								<div className="text-[13px] font-medium text-fg">{fd.label}</div>
								<div className="mt-0.5 text-[11px] text-fg-3">{fd.hint}</div>
							</div>
							<Toggle
								label={fd.label}
								checked={on}
								disabled={readOnly}
								onChange={(checked) => {
									if (fd.key === "deprecated" && !checked) {
										onChange({ deprecated: false, redirectTo: undefined });
									} else {
										onChange({ [fd.key]: checked });
									}
								}}
							/>
						</div>
						{fd.key === "deprecated" && on && (
							<div className="mt-2">
								<input
									aria-label="Redirect to"
									disabled={readOnly}
									value={field.redirectTo ?? ""}
									placeholder="path.to.replacement"
									onChange={(e) => onChange({ redirectTo: e.target.value })}
									className={`${inputCls(readOnly)} w-full font-mono`}
								/>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// --- dependent_required rule builder ----------------------------------------

/**
 * Presence-triggered required-field rules (dependent_required): when every `when`
 * field is set, the `require` fields become mandatory.
 *
 * GRACEFUL DEGRADATION: the decree REST gateway does not (yet) expose a
 * dependent_required model — there is no such field on v1Schema or v1SchemaField,
 * and UpdateSchema carries none. So rules authored here are held client-side and
 * are NOT persisted; the banner says so plainly rather than implying a round-trip
 * the gateway can't honour. When the server adds the field, wiring this to the
 * UpdateSchema body is the only change needed.
 */
function DependentRulesEditor({
	fields,
	rules,
	readOnly,
	onChange,
}: {
	fields: SchemaField[];
	rules: DependentRule[];
	readOnly: boolean;
	onChange: (rules: DependentRule[]) => void;
}) {
	const paths = fields.map((f) => f.path ?? "").filter((p) => p !== "");

	const addRule = () => onChange([...rules, { when: [], require: [] }]);
	const removeRule = (i: number) => onChange(rules.filter((_, idx) => idx !== i));
	const setRule = (i: number, rule: DependentRule) =>
		onChange(rules.map((r, idx) => (idx === i ? rule : r)));

	return (
		<div data-testid="dependent-rules" className="space-y-4">
			<Section num="⚿" title="Cross-field rules — dependent_required" hint="presence-triggered">
				<div
					data-testid="dependent-required-note"
					className="mb-3 flex items-start gap-2 rounded-[var(--r-sm)] border border-[color-mix(in_oklch,var(--warn)_35%,transparent)] bg-warn-soft px-3 py-2 text-[11px] text-warn"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="h-3.5 w-3.5 flex-none"
					>
						<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
					</svg>
					<span>
						The config service gateway does not yet expose dependent_required on the schema, so
						rules authored here are <b>not persisted</b>. This builder previews the intended model;
						it will round-trip once the server adds the field.
					</span>
				</div>

				{rules.length === 0 && (
					<p className="text-xs text-fg-3" data-testid="rules-empty">
						<b className="text-fg-2">No rules defined.</b> Add one to require a field only when
						another is present.
					</p>
				)}

				<div className="space-y-2">
					{rules.map((rule, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: rules are positional and order-stable
							key={i}
							data-testid={`rule-${i}`}
							className="flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] border border-line-2 bg-surface px-3 py-2"
						>
							<span className="font-mono text-[11px] text-fg-3">require</span>
							<PathSelect
								label={`Required field for rule ${i + 1}`}
								paths={paths}
								value={rule.require[0] ?? ""}
								disabled={readOnly}
								onChange={(p) => setRule(i, { ...rule, require: p ? [p] : [] })}
							/>
							<span className="font-mono text-[11px] text-fg-3">when</span>
							<PathSelect
								label={`Trigger field for rule ${i + 1}`}
								paths={paths}
								value={rule.when[0] ?? ""}
								disabled={readOnly}
								onChange={(p) => setRule(i, { ...rule, when: p ? [p] : [] })}
							/>
							<span className="font-mono text-[11px] text-fg-3">is present</span>
							{!isRuleComplete(rule) && (
								<span className="font-mono text-[10px] text-warn">incomplete</span>
							)}
							{!readOnly && (
								<button
									type="button"
									onClick={() => removeRule(i)}
									aria-label={`Remove rule ${i + 1}`}
									className="ml-auto rounded-[var(--r-xs)] px-1.5 text-fg-3 hover:text-danger"
								>
									×
								</button>
							)}
						</div>
					))}
				</div>

				{!readOnly && (
					<button
						type="button"
						onClick={addRule}
						data-testid="add-rule"
						className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-dashed border-line-2 px-3 py-1.5 text-xs font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3.5 w-3.5"
						>
							<path d="M12 5v14M5 12h14" />
						</svg>
						Add rule
					</button>
				)}

				{rules.some(isRuleComplete) && (
					<ul className="mt-3 space-y-1" data-testid="rules-summary">
						{rules.filter(isRuleComplete).map((r) => (
							<li key={summarizeRule(r)} className="font-mono text-[11px] text-fg-3">
								{summarizeRule(r)}
							</li>
						))}
					</ul>
				)}
			</Section>
		</div>
	);
}

function PathSelect({
	label,
	paths,
	value,
	disabled,
	onChange,
}: {
	label: string;
	paths: string[];
	value: string;
	disabled: boolean;
	onChange: (path: string) => void;
}) {
	return (
		<select
			aria-label={label}
			disabled={disabled}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className={`${inputCls(disabled)} max-w-44 font-mono text-xs`}
		>
			<option value="">— field —</option>
			{paths.map((p) => (
				<option key={p} value={p}>
					{p}
				</option>
			))}
		</select>
	);
}

// --- Publish modal -----------------------------------------------------------

function PublishModal({
	name,
	version,
	pending,
	onCancel,
	onConfirm,
}: {
	name: string;
	version: number;
	pending: boolean;
	onCancel: () => void;
	onConfirm: (note: string) => void;
}) {
	const [note, setNote] = useState("");
	const titleId = useId();
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			data-testid="publish-modal"
		>
			<div className="w-full max-w-md rounded-[var(--r-lg)] border border-line bg-surface shadow-[var(--sh-2)]">
				<div className="flex items-center gap-2 border-b border-line px-4 py-3">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="var(--ok)"
						strokeWidth="2"
						className="h-4 w-4"
					>
						<path d="M12 19V5M5 12l7-7 7 7" />
					</svg>
					<h3 id={titleId} className="text-sm font-semibold text-fg">
						Publish{" "}
						<span className="font-mono">
							{name} v{version}
						</span>
						?
					</h3>
				</div>
				<div className="px-4 py-3 text-sm text-fg-2">
					<p>
						Publishing <b className="text-fg">freezes v{version} permanently</b> — its field
						definitions become <b className="text-fg">immutable</b>. Future changes require a new
						draft.
					</p>
					<p className="mt-2 flex items-start gap-2 text-xs text-fg-3">
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="mt-0.5 h-3.5 w-3.5 flex-none"
						>
							<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
						</svg>
						<span>
							This does <b>not</b> change any tenant's bound version. Existing tenants stay on their
							current version until you migrate them.
						</span>
					</p>
					<input
						value={note}
						onChange={(e) => setNote(e.target.value)}
						aria-label="Changelog"
						placeholder="Changelog — what changed? (recorded on the version)"
						className="mt-3 w-full rounded-[var(--r-sm)] border border-line-2 bg-canvas px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
					/>
				</div>
				<div className="flex justify-end gap-2 border-t border-line px-4 py-3">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-surface-3"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => onConfirm(note)}
						disabled={pending}
						className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-ok px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
						data-testid="publish-confirm"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3.5 w-3.5"
						>
							<path d="M12 19V5M5 12l7-7 7 7" />
						</svg>
						{pending ? "Publishing…" : "Publish & freeze"}
					</button>
				</div>
			</div>
		</div>
	);
}

// --- Shared bits -------------------------------------------------------------

function EmptyEditor({ onAdd }: { onAdd?: () => void }) {
	return (
		<div
			data-testid="editor-empty"
			className="rounded-[var(--r-md)] border border-dashed border-line-2 bg-surface px-6 py-16 text-center"
		>
			<p className="text-sm text-fg-2">Select a field to edit its definition.</p>
			{onAdd && (
				<button
					type="button"
					onClick={onAdd}
					className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-3"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="h-3.5 w-3.5"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					Add the first field
				</button>
			)}
		</div>
	);
}

function Section({
	num,
	title,
	hint,
	children,
}: {
	num: number | string;
	title: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-[var(--r-md)] border border-line bg-surface">
			<div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
				<span className="grid h-5 w-5 flex-none place-items-center rounded-[var(--r-xs)] bg-surface-3 font-mono text-[11px] text-fg-2">
					{num}
				</span>
				<h3 className="text-sm font-semibold text-fg">{title}</h3>
				{hint && <span className="ml-auto font-mono text-[11px] text-fg-3">{hint}</span>}
			</div>
			<div className="space-y-3 px-3 py-3">{children}</div>
		</div>
	);
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start sm:gap-3">
			<div className="pt-1.5">
				<div className="text-[13px] text-fg-2">{label}</div>
				{sub && <div className="font-mono text-[10px] text-fg-3">{sub}</div>}
			</div>
			<div className="min-w-0">{children}</div>
		</div>
	);
}

/** An add/remove set of string chips — used for enum values and URL allow-lists. */
function ChipSet({
	values,
	readOnly,
	placeholder,
	testid,
	onChange,
}: {
	values: string[];
	readOnly: boolean;
	placeholder: string;
	testid: string;
	onChange: (values: string[]) => void;
}) {
	const [entry, setEntry] = useState("");
	const commit = () => {
		const v = entry.trim();
		if (v === "" || values.includes(v)) {
			setEntry("");
			return;
		}
		onChange([...values, v]);
		setEntry("");
	};
	return (
		<div className="flex flex-wrap items-center gap-1.5" data-testid={testid}>
			{values.map((v) => (
				<span
					key={v}
					className="inline-flex items-center gap-1 rounded-[var(--r-xs)] border border-line-2 bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg-2"
				>
					{v}
					{!readOnly && (
						<button
							type="button"
							aria-label={`Remove ${v}`}
							onClick={() => onChange(values.filter((x) => x !== v))}
							className="text-fg-3 hover:text-danger"
						>
							×
						</button>
					)}
				</span>
			))}
			{!readOnly && (
				<input
					aria-label={placeholder}
					value={entry}
					placeholder={placeholder}
					onChange={(e) => setEntry(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							commit();
						}
					}}
					onBlur={commit}
					className={`${inputCls(false)} w-32 font-mono text-xs`}
				/>
			)}
		</div>
	);
}

function Toggle({
	label,
	checked,
	disabled,
	onChange,
}: {
	label: string;
	checked: boolean;
	disabled: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-fg-2">
			<input
				type="checkbox"
				aria-label={label}
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
				className="peer sr-only"
			/>
			<span
				className={`relative h-[18px] w-[32px] flex-none rounded-[var(--r-pill)] border transition-colors ${
					checked ? "border-transparent bg-accent" : "border-line-2 bg-surface-3"
				} peer-disabled:opacity-50`}
			>
				<span
					className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full transition-transform ${
						checked ? "translate-x-3.5 bg-white" : "bg-fg-3"
					}`}
				/>
			</span>
		</label>
	);
}

function inputCls(_disabled: boolean): string {
	return "rounded-[var(--r-sm)] border border-line-2 bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-3";
}
