import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { components } from "../../api/schema";
import {
	DeprecatedBadge,
	ReadOnlyBadge,
	SensitiveBadge,
	WriteOnceBadge,
} from "../../components/FieldBadges";
import { useAuth } from "../../lib/auth";
import { fieldTypeColor, fieldTypeIcon, fieldTypeLabel } from "../../lib/field-types";
import { groupFields } from "../../lib/fields";
import { useApiClient, useSchema } from "../../lib/hooks";
import { CHEVRON_DOWN, CHEVRON_RIGHT } from "../../lib/icons";
import { label } from "../../lib/labels";
import { canManageSchemas } from "../../lib/permissions";

type SchemaField = components["schemas"]["v1SchemaField"];
type FieldConstraints = components["schemas"]["v1FieldConstraints"];
type SchemaInfo = components["schemas"]["v1SchemaInfo"];

/** Schema detail page with fields table, publish, and export actions. */
export function SchemaDetail() {
	const { id } = useParams<{ id: string }>();
	const { auth } = useAuth();
	const { data, isLoading, error } = useSchema(id ?? "");
	const client = useApiClient();
	const queryClient = useQueryClient();

	const schema = data?.schema;
	const schemaId = id ?? "";

	const publishMutation = useMutation({
		mutationFn: async () => {
			const { data: result, error: err } = await client.POST("/v1/schemas/{id}/publish", {
				params: { path: { id: schemaId } },
				body: { version: schema?.version },
			});
			if (err) throw new Error(formatError(err));
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["schemas", id] });
			queryClient.invalidateQueries({ queryKey: ["schemas"] });
		},
	});

	const handleExport = async () => {
		const { data: result, error: err } = await client.GET("/v1/schemas/{id}/export", {
			params: { path: { id: schemaId } },
		});
		if (err) {
			alert(`Export failed: ${formatError(err)}`);
			return;
		}
		const yaml = result?.yamlContent ?? "";
		const blob = new Blob([yaml], { type: "application/yaml" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${schema?.name ?? "schema"}-v${schema?.version ?? 1}.yaml`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div>
			<div className="mb-6">
				<Link to="/schemas" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
					&larr; {label("common.back")} to {label("schema.plural").toLowerCase()}
				</Link>
			</div>

			{isLoading && <p className="text-gray-500 dark:text-gray-400">Loading schema...</p>}

			{error && (
				<p className="text-red-600 dark:text-red-400">Error loading schema: {error.message}</p>
			)}

			{schema && (
				<>
					<div className="mb-6 flex items-start justify-between">
						<div>
							<h2 className="text-xl font-semibold">{schema.name}</h2>
							<SchemaInfoBlock info={schema.info} />
						</div>
						<div className="flex gap-2">
							{!schema.published && canManageSchemas(auth.role) && (
								<button
									type="button"
									onClick={() => publishMutation.mutate()}
									disabled={publishMutation.isPending}
									className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
								>
									{publishMutation.isPending ? label("schema.publishing") : label("schema.publish")}
								</button>
							)}
							<button
								type="button"
								onClick={handleExport}
								className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
							>
								{label("schema.export")}
							</button>
						</div>
					</div>

					{publishMutation.isError && (
						<p className="mb-4 text-red-600 dark:text-red-400">
							Publish failed: {publishMutation.error.message}
						</p>
					)}

					<div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
						<InfoCard label="Version" value={`v${schema.version}`} />
						<InfoCard
							label="Status"
							value={
								schema.published ? label("schema.statusPublished") : label("schema.statusDraft")
							}
						/>
						<InfoCard
							label="Created"
							value={schema.createdAt ? new Date(schema.createdAt).toLocaleDateString() : "-"}
						/>
					</div>

					{schema.checksum && (
						<p className="mb-6 text-xs text-gray-400 dark:text-gray-500">
							Checksum: {schema.checksum}
						</p>
					)}

					<FieldsSection fields={schema.fields ?? []} />

					<div className="mt-8">
						<h3 className="mb-3 text-lg font-medium">Tenants</h3>
						<Link
							to={`/schemas/${id}/tenants`}
							className="text-sm text-blue-600 hover:underline dark:text-blue-400"
						>
							View tenants using this schema &rarr;
						</Link>
					</div>
				</>
			)}
		</div>
	);
}

// --- Schema Info Block ---

function SchemaInfoBlock({ info }: { info?: SchemaInfo | null }) {
	if (!info) return null;

	const hasContent = info.title || info.author;
	if (!hasContent) return null;

	return (
		<div className="mt-2 space-y-1">
			{info.title && (
				<p className="text-sm font-medium text-gray-700 dark:text-gray-300">{info.title}</p>
			)}
			{info.author && (
				<p className="text-xs text-gray-400 dark:text-gray-500">
					Author: {info.author}
					{info.contact?.email && ` (${info.contact.email})`}
				</p>
			)}
			{info.labels && Object.keys(info.labels).length > 0 && (
				<div className="flex flex-wrap gap-1 pt-1">
					{Object.entries(info.labels).map(([k, v]) => (
						<span
							key={k}
							className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
						>
							{k}: {v}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

// --- Fields Section (grouped by first tag) ---

function FieldsSection({ fields }: { fields: SchemaField[] }) {
	const groups = groupFields(fields);
	const hasMultipleGroups = groups.length > 1 || (groups.length === 1 && groups[0].name !== "");

	return (
		<div>
			<div className="mb-3 flex items-center gap-2">
				<h3 className="text-lg font-medium">Fields</h3>
				<span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
					{fields.length}
				</span>
			</div>

			{fields.length === 0 ? (
				<p className="text-gray-500 dark:text-gray-400">{label("schema.noFields")}</p>
			) : hasMultipleGroups ? (
				<div className="space-y-6">
					{groups.map((group) => (
						<div key={group.name}>
							{group.name && (
								<h4 className="mb-2 text-sm font-medium text-gray-500 uppercase tracking-wide dark:text-gray-400">
									{group.name}
								</h4>
							)}
							{!group.name && (
								<h4 className="mb-2 text-sm font-medium text-gray-400 uppercase tracking-wide dark:text-gray-500">
									General
								</h4>
							)}
							<FieldsTable fields={group.fields} />
						</div>
					))}
				</div>
			) : (
				<FieldsTable fields={fields} />
			)}
		</div>
	);
}

// --- Fields Table ---

function FieldsTable({ fields }: { fields: SchemaField[] }) {
	const [expandedPath, setExpandedPath] = useState<string | null>(null);

	const toggle = (path: string) => {
		setExpandedPath((prev) => (prev === path ? null : path));
	};

	return (
		<div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
			<table className="w-full text-left text-sm">
				<thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
					<tr>
						<th className="w-6 px-2 py-3" />
						<th className="px-4 py-3 font-medium">Field</th>
						<th className="px-4 py-3 font-medium">Description</th>
						<th className="px-4 py-3 font-medium">Nullable</th>
						<th className="px-4 py-3 font-medium">Constraints</th>
					</tr>
				</thead>
				<tbody>
					{fields.map((field) => {
						const isExpanded = expandedPath === field.path;
						const hasDetails = fieldHasDetails(field);
						const isDeprecated = field.deprecated;

						return (
							<Fragment key={field.path}>
								<tr
									className={`border-b border-gray-100 dark:border-gray-800 ${hasDetails ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900" : ""}`}
									onClick={() => hasDetails && toggle(field.path ?? "")}
								>
									<td className="px-2 py-3 text-center text-xs text-gray-400">
										{hasDetails && (isExpanded ? CHEVRON_DOWN : CHEVRON_RIGHT)}
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<TypeBadge type={field.type} />
											<span
												className={`font-mono text-sm ${isDeprecated ? "text-gray-400 dark:text-gray-600" : ""}`}
											>
												{field.path}
											</span>
											{isDeprecated && <DeprecatedBadge />}
										</div>
									</td>
									<td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
										{field.description || "—"}
									</td>
									<td className="px-4 py-3">{field.nullable ? "Yes" : "No"}</td>
									<td className="px-4 py-3 text-gray-500 dark:text-gray-400">
										{constraintsSummary(field)}
									</td>
								</tr>
								{isExpanded && (
									<tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50">
										<td />
										<td colSpan={4} className="px-4 pb-4 pt-2">
											<FieldDetails field={field} />
										</td>
									</tr>
								)}
							</Fragment>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

// --- Field Sub-components ---

function TypeBadge({ type }: { type?: SchemaField["type"] }) {
	return (
		<span className="group relative">
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

/** Check if a field has expandable details. */
function fieldHasDetails(field: SchemaField): boolean {
	return !!(
		field.title ||
		field.example ||
		(field.examples && Object.keys(field.examples).length > 0) ||
		field.format ||
		field.externalDocs?.url ||
		field.readOnly ||
		field.writeOnce ||
		field.sensitive ||
		field.defaultValue ||
		field.redirectTo
	);
}

/** Expanded detail panel shown below a field row. */
function FieldDetails({ field }: { field: SchemaField }) {
	const examples = field.examples && Object.keys(field.examples).length > 0 ? field.examples : null;

	return (
		<div className="space-y-2 text-sm">
			{field.title && <p className="font-medium text-gray-700 dark:text-gray-300">{field.title}</p>}

			{field.defaultValue && <Detail label="Default" value={field.defaultValue} mono />}

			{field.example && <Detail label="Example" value={field.example} mono />}

			{examples && (
				<div>
					<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Examples:</span>
					<ul className="ml-4 mt-1 list-disc text-xs text-gray-600 dark:text-gray-400">
						{Object.entries(examples).map(([name, ex]) => (
							<li key={name}>
								<span className="font-medium">{name}</span>
								{ex.value && (
									<code className="ml-1 rounded bg-gray-100 px-1 dark:bg-gray-800">{ex.value}</code>
								)}
								{ex.summary && <span className="ml-1 text-gray-400">— {ex.summary}</span>}
							</li>
						))}
					</ul>
				</div>
			)}

			{field.format && <Detail label="Format" value={field.format} />}

			{field.externalDocs?.url && (
				<div>
					<span className="text-xs font-medium text-gray-500 dark:text-gray-400">Docs: </span>
					<a
						href={field.externalDocs.url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-blue-600 hover:underline dark:text-blue-400"
					>
						{field.externalDocs.description || field.externalDocs.url}
					</a>
				</div>
			)}

			{field.redirectTo && <Detail label="Redirects to" value={field.redirectTo} mono />}

			<FieldFlags field={field} />
		</div>
	);
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
	return (
		<p className="text-xs">
			<span className="font-medium text-gray-500 dark:text-gray-400">{label}: </span>
			<span className={mono ? "rounded bg-gray-100 px-1 font-mono dark:bg-gray-800" : ""}>
				{value}
			</span>
		</p>
	);
}

function FieldFlags({ field }: { field: SchemaField }) {
	const hasFlags = field.readOnly || field.writeOnce || field.sensitive;
	if (!hasFlags) return null;

	return (
		<div className="flex gap-1.5">
			{field.readOnly && <ReadOnlyBadge />}
			{field.writeOnce && <WriteOnceBadge />}
			{field.sensitive && <SensitiveBadge />}
		</div>
	);
}

// --- Shared Components ---

function InfoCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded border border-gray-200 p-3 dark:border-gray-800">
			<p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
			<p className="mt-1 font-medium">{value}</p>
		</div>
	);
}

/** Summarize field constraints into a short human-readable string. */
function constraintsSummary(field: SchemaField): string {
	const c = field.constraints;
	if (!c) return "-";
	const parts: string[] = [];
	if (c.min !== undefined || c.max !== undefined) {
		parts.push(formatRange(c));
	}
	if (c.minLength !== undefined || c.maxLength !== undefined) {
		parts.push(formatLengthRange(c));
	}
	if (c.regex) parts.push(`pattern: ${c.regex}`);
	if (c.enumValues && c.enumValues.length > 0) {
		parts.push(`enum(${c.enumValues.length})`);
	}
	if (c.jsonSchema) parts.push("JSON schema");
	return parts.length > 0 ? parts.join(", ") : "-";
}

function formatRange(c: FieldConstraints): string {
	if (c.min !== undefined && c.max !== undefined) return `${c.min}..${c.max}`;
	if (c.min !== undefined) return `>= ${c.min}`;
	return `<= ${c.max}`;
}

function formatLengthRange(c: FieldConstraints): string {
	if (c.minLength !== undefined && c.maxLength !== undefined)
		return `len ${c.minLength}..${c.maxLength}`;
	if (c.minLength !== undefined) return `len >= ${c.minLength}`;
	return `len <= ${c.maxLength}`;
}

function formatError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message: string }).message);
	}
	return "An unexpected error occurred";
}
