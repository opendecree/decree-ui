import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { components } from "../../api/schema";
import {
	DeprecatedBadge,
	ReadOnlyBadge,
	SensitiveBadge,
	WriteOnceBadge,
} from "../../components/FieldBadges";
import { PendingChangesBar } from "../../components/PendingChangesBar";
import { TypedInput } from "../../components/TypedInput";
import { useAuth } from "../../lib/auth";
import { fieldTypeColor, fieldTypeIcon, fieldTypeLabel } from "../../lib/field-types";
import { groupFields } from "../../lib/fields";
import {
	useApiClient,
	useConfig,
	useFieldLocks,
	useSchemaVersion,
	useTenant,
} from "../../lib/hooks";
import { label } from "../../lib/labels";
import { canEditConfig, canManageLocks, canManageTenants } from "../../lib/permissions";

type SchemaField = components["schemas"]["v1SchemaField"];
type TypedValue = components["schemas"]["v1TypedValue"];
type FieldType = components["schemas"]["v1FieldType"];

function typedValueToString(tv: TypedValue | undefined): string {
	if (!tv) return "";
	if (tv.stringValue !== undefined) return tv.stringValue;
	if (tv.integerValue !== undefined) return String(tv.integerValue);
	if (tv.numberValue !== undefined) return String(tv.numberValue);
	if (tv.boolValue !== undefined) return String(tv.boolValue);
	if (tv.timeValue !== undefined) return tv.timeValue;
	if (tv.durationValue !== undefined) return tv.durationValue;
	if (tv.urlValue !== undefined) return tv.urlValue;
	if (tv.jsonValue !== undefined) return tv.jsonValue;
	return "";
}

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

/** Tenant detail page with inline config viewer/editor. */
export function TenantDetail() {
	const { id } = useParams<{ id: string }>();
	const tid = id ?? "";
	const { auth } = useAuth();
	const navigate = useNavigate();
	const client = useApiClient();
	const queryClient = useQueryClient();

	const { data: tenantData, isLoading: tenantLoading, error: tenantError } = useTenant(tid);
	const tenant = tenantData?.tenant;

	const { data: schemaData, isLoading: schemaLoading } = useSchemaVersion(
		tenant?.schemaId ?? "",
		tenant?.schemaVersion,
	);
	const schema = schemaData?.schema;

	const { data: configData, isLoading: configLoading } = useConfig(tid);
	const config = configData?.config;

	const { data: locksData } = useFieldLocks(tid);

	const [editing, setEditing] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [pendingChanges, setPendingChanges] = useState<Map<string, string>>(new Map());
	const [description, setDescription] = useState("");
	const [applyError, setApplyError] = useState<string | null>(null);

	const fields = schema?.fields ?? [];
	const configValues = config?.values ?? [];
	const locks = locksData?.locks ?? [];

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

	const fieldTypeMap = useMemo(() => {
		const m = new Map<string, SchemaField>();
		for (const f of fields) {
			if (f.path) m.set(f.path, f);
		}
		return m;
	}, [fields]);

	const lockedFields = useMemo(() => {
		const s = new Set<string>();
		for (const lock of locks) {
			if (lock.fieldPath) s.add(lock.fieldPath);
		}
		return s;
	}, [locks]);

	const fieldMeta = useMemo(() => {
		const m = new Map<string, { type?: FieldType; title?: string }>();
		for (const f of fields) {
			if (f.path) m.set(f.path, { type: f.type, title: f.title ?? f.path });
		}
		return m;
	}, [fields]);

	const groups = useMemo(() => groupFields(fields), [fields]);

	const getDisplayValue = useCallback(
		(path: string): string => {
			if (pendingChanges.has(path)) return pendingChanges.get(path) as string;
			return serverValueMap.get(path) ?? "";
		},
		[pendingChanges, serverValueMap],
	);

	const handleChange = useCallback(
		(path: string, value: string) => {
			const serverValue = serverValueMap.get(path) ?? "";
			setPendingChanges((prev) => {
				const next = new Map(prev);
				if (value === serverValue) next.delete(path);
				else next.set(path, value);
				return next;
			});
			setApplyError(null);
		},
		[serverValueMap],
	);

	const handleUndo = useCallback((path: string) => {
		setPendingChanges((prev) => {
			const next = new Map(prev);
			next.delete(path);
			return next;
		});
	}, []);

	const handleResetAll = useCallback(() => {
		setPendingChanges(new Map());
		setDescription("");
		setApplyError(null);
	}, []);

	const handleCancelEdit = useCallback(() => {
		handleResetAll();
		setEditing(false);
	}, [handleResetAll]);

	const applyMutation = useMutation({
		mutationFn: async () => {
			const updates = [...pendingChanges.entries()].map(([fieldPath, value]) => {
				const sf = fieldTypeMap.get(fieldPath);
				return {
					fieldPath,
					value: stringToTypedValue(value, sf?.type),
					expectedChecksum: checksumMap.get(fieldPath),
				};
			});
			const { error: err } = await client.POST("/v1/tenants/{tenantId}/config:batchSet", {
				params: { path: { tenantId: tid } },
				body: { updates, description: description || undefined },
			});
			if (err) throw new Error(formatError(err));
		},
		onSuccess: () => {
			setPendingChanges(new Map());
			setDescription("");
			setApplyError(null);
			setEditing(false);
			queryClient.invalidateQueries({ queryKey: ["config", tid] });
		},
		onError: (err: Error) => setApplyError(err.message),
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const { error: err } = await client.DELETE("/v1/tenants/{id}", {
				params: { path: { id: tid } },
			});
			if (err) throw new Error(formatError(err));
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
			navigate("/tenants");
		},
	});

	const lockMutation = useMutation({
		mutationFn: async (fp: string) => {
			const { error: err } = await client.POST("/v1/tenants/{tenantId}/locks", {
				params: { path: { tenantId: tid } },
				body: { fieldPath: fp },
			});
			if (err) throw new Error(formatError(err));
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["locks", tid] }),
	});

	const unlockMutation = useMutation({
		mutationFn: async (fp: string) => {
			const { error: err } = await client.DELETE("/v1/tenants/{tenantId}/locks/{fieldPath}", {
				params: { path: { tenantId: tid, fieldPath: fp } },
			});
			if (err) throw new Error(formatError(err));
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["locks", tid] }),
	});

	const isLoading = tenantLoading || schemaLoading || configLoading;

	return (
		<div className={editing && pendingChanges.size > 0 ? "pb-24" : ""}>
			<div className="mb-6">
				<Link to="/tenants" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
					&larr; {label("common.back")} to {label("tenant.plural").toLowerCase()}
				</Link>
			</div>

			{isLoading && <p className="text-gray-500 dark:text-gray-400">{label("common.loading")}</p>}
			{tenantError && (
				<p className="text-red-600 dark:text-red-400">Error: {tenantError.message}</p>
			)}

			{tenant && (
				<>
					<div className="mb-6 flex items-start justify-between">
						<div>
							<h2 className="text-xl font-semibold">{tenant.name}</h2>
							<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
								{schema ? (
									<>
										<Link
											to={`/schemas/${tenant.schemaId}`}
											className="text-blue-600 hover:underline dark:text-blue-400"
										>
											{schema.name}
										</Link>
										{" v"}
										{tenant.schemaVersion}
									</>
								) : (
									<>Schema v{tenant.schemaVersion}</>
								)}
								{config && <> &middot; Config v{config.version}</>}
							</p>
						</div>
						<div className="flex gap-2">
							{canEditConfig(auth.role) &&
								(!editing ? (
									<button
										type="button"
										onClick={() => setEditing(true)}
										className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
									>
										{label("config.edit")}
									</button>
								) : (
									<button
										type="button"
										onClick={handleCancelEdit}
										className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
									>
										{label("config.cancelEdit")}
									</button>
								))}
							{canManageTenants(auth.role) &&
								(!showDeleteConfirm ? (
									<button
										type="button"
										onClick={() => setShowDeleteConfirm(true)}
										className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
									>
										{label("tenant.delete")}
									</button>
								) : (
									<>
										<button
											type="button"
											onClick={() => deleteMutation.mutate()}
											disabled={deleteMutation.isPending}
											className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
										>
											{deleteMutation.isPending
												? label("tenant.deleting")
												: label("tenant.confirmDelete")}
										</button>
										<button
											type="button"
											onClick={() => setShowDeleteConfirm(false)}
											className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
										>
											{label("common.cancel")}
										</button>
									</>
								))}
						</div>
					</div>

					{deleteMutation.isError && (
						<p className="mb-4 text-red-600 dark:text-red-400">
							Delete failed: {deleteMutation.error.message}
						</p>
					)}

					{groups.length === 0 && (
						<p className="text-gray-500 dark:text-gray-400">{label("schema.noFields")}</p>
					)}

					<div className="space-y-8">
						{groups.map((group) => (
							<div key={group.name}>
								{(groups.length > 1 || group.name !== "") && (
									<h3 className="mb-3 text-sm font-medium text-gray-500 uppercase tracking-wide dark:text-gray-400">
										{group.name || "General"}
									</h3>
								)}
								<div className="space-y-3">
									{group.fields.map((field) => (
										<FieldRow
											key={field.path}
											field={field}
											value={getDisplayValue(field.path ?? "")}
											isDirty={pendingChanges.has(field.path ?? "")}
											isLocked={lockedFields.has(field.path ?? "")}
											editing={editing}
											showLocks={canManageLocks(auth.role)}
											onChange={(v) => handleChange(field.path ?? "", v)}
											onUndo={() => handleUndo(field.path ?? "")}
											onLock={() => lockMutation.mutate(field.path ?? "")}
											onUnlock={() => unlockMutation.mutate(field.path ?? "")}
										/>
									))}
								</div>
							</div>
						))}
					</div>

					{editing && (
						<PendingChangesBar
							pendingChanges={pendingChanges}
							serverValues={serverValueMap}
							fieldMeta={fieldMeta}
							description={description}
							onDescriptionChange={setDescription}
							onApply={() => applyMutation.mutate()}
							onReset={handleResetAll}
							isApplying={applyMutation.isPending}
							applyError={applyError}
						/>
					)}
				</>
			)}
		</div>
	);
}

interface FieldRowProps {
	field: SchemaField;
	value: string;
	isDirty: boolean;
	isLocked: boolean;
	editing: boolean;
	showLocks: boolean;
	onChange: (value: string) => void;
	onUndo: () => void;
	onLock: () => void;
	onUnlock: () => void;
}

function FieldRow({
	field,
	value,
	isDirty,
	isLocked,
	editing,
	showLocks,
	onChange,
	onUndo,
	onLock,
	onUnlock,
}: FieldRowProps) {
	const hasValue = value !== "";
	const isWriteOnceLocked = field.writeOnce && hasValue;
	const disabled = !editing || isLocked || field.readOnly || isWriteOnceLocked;

	return (
		<div
			className={`flex items-start gap-4 rounded border p-3 ${
				field.deprecated
					? "border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20"
					: isDirty
						? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/30"
						: "border-gray-200 dark:border-gray-800"
			}`}
		>
			<TypeBadge type={field.type} />
			<div className="min-w-0 flex-1">
				<div className="mb-1 flex items-center gap-2">
					{field.title ? (
						<>
							<span className="text-sm font-medium">{field.title}</span>
							<span className="font-mono text-xs text-gray-400 dark:text-gray-500">
								{field.path}
							</span>
						</>
					) : (
						<span className="font-mono text-sm font-medium">{field.path}</span>
					)}
					{isDirty && <span className="h-2 w-2 rounded-full bg-blue-500" title="Modified" />}
					{field.nullable && (
						<span className="text-xs text-gray-400 dark:text-gray-500">
							{label("config.nullable")}
						</span>
					)}
					{isLocked && (
						<span className="text-xs text-amber-600 dark:text-amber-400">
							{label("config.locked")}
						</span>
					)}
					{field.deprecated && <DeprecatedBadge />}
					{field.readOnly && <ReadOnlyBadge />}
					{field.writeOnce && <WriteOnceBadge hasValue={hasValue} />}
					{field.sensitive && <SensitiveBadge />}
				</div>
				{field.description && (
					<p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
				)}
				{field.deprecated && field.redirectTo && (
					<p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
						Use <span className="font-mono">{field.redirectTo}</span> instead
					</p>
				)}
				{editing ? (
					<TypedInput
						fieldPath={field.path ?? ""}
						fieldType={field.type}
						constraints={field.constraints}
						value={value}
						onChange={onChange}
						disabled={disabled}
					/>
				) : (
					<ReadOnlyValue value={value} fieldType={field.type} sensitive={field.sensitive} />
				)}
			</div>
			{editing && (
				<div className="flex items-center gap-1 pt-1">
					{showLocks &&
						(isLocked ? (
							<button
								type="button"
								onClick={onUnlock}
								title="Unlock"
								className="rounded p-1 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
							>
								<LockIcon />
							</button>
						) : (
							<button
								type="button"
								onClick={onLock}
								title="Lock"
								className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:text-gray-600 dark:hover:bg-gray-800"
							>
								<UnlockIcon />
							</button>
						))}
					{isDirty && (
						<button
							type="button"
							onClick={onUndo}
							title="Undo"
							className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
						>
							<UndoIcon />
						</button>
					)}
				</div>
			)}
		</div>
	);
}

function ReadOnlyValue({
	value,
	fieldType,
	sensitive,
}: {
	value: string;
	fieldType?: FieldType;
	sensitive?: boolean;
}) {
	if (!value) {
		return (
			<span className="text-sm text-gray-300 italic dark:text-gray-600">
				{label("config.notSet")}
			</span>
		);
	}
	if (sensitive) {
		return <span className="text-sm text-gray-400 dark:text-gray-500">{"••••••••"}</span>;
	}
	if (fieldType === "FIELD_TYPE_BOOL") {
		return (
			<span
				className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${value === "true" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
			>
				{value}
			</span>
		);
	}
	if (fieldType === "FIELD_TYPE_JSON") {
		return (
			<pre className="rounded bg-gray-50 p-2 text-xs font-mono text-gray-700 dark:bg-gray-900 dark:text-gray-300">
				{value}
			</pre>
		);
	}
	if (fieldType === "FIELD_TYPE_URL") {
		return (
			<a
				href={value}
				target="_blank"
				rel="noopener noreferrer"
				className="text-sm text-blue-600 hover:underline dark:text-blue-400"
			>
				{value}
			</a>
		);
	}
	if (fieldType === "FIELD_TYPE_DURATION") {
		return <span className="text-sm">{formatDuration(value)}</span>;
	}
	return <span className="text-sm">{value}</span>;
}

/** Format a duration string (e.g. "86400s") into human-readable form (e.g. "24h"). */
function formatDuration(raw: string): string {
	const match = raw.match(/^(\d+(?:\.\d+)?)s$/);
	if (!match) return raw;
	const totalSeconds = Number(match[1]);
	if (totalSeconds === 0) return "0s";
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const parts: string[] = [];
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (seconds > 0) parts.push(`${seconds}s`);
	return parts.join("") || "0s";
}

function TypeBadge({ type }: { type?: FieldType }) {
	return (
		<span className="group relative pt-1">
			<span
				className={`inline-flex w-9 items-center justify-center rounded py-0.5 text-xs font-bold leading-tight ${fieldTypeColor(type)}`}
			>
				{fieldTypeIcon(type)}
			</span>
			<span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-100 shadow-lg group-hover:block dark:bg-gray-700">
				{fieldTypeLabel(type)}
			</span>
		</span>
	);
}

function LockIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			className="h-4 w-4"
			role="img"
			aria-label="Locked"
		>
			<path
				fillRule="evenodd"
				d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function UnlockIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			className="h-4 w-4"
			role="img"
			aria-label="Unlocked"
		>
			<path d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-5.5V5.5a3 3 0 016 0v.5a.75.75 0 001.5 0v-.5A4.5 4.5 0 0010 1z" />
		</svg>
	);
}

function UndoIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			className="h-4 w-4"
			role="img"
			aria-label="Undo"
		>
			<path
				fillRule="evenodd"
				d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function formatError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message: string }).message);
	}
	return "An unexpected error occurred";
}
