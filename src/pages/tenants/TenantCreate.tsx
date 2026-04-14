import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApiClient, useSchemas } from "../../lib/hooks";
import { label } from "../../lib/labels";

/** Tenant creation page with name, schema selection, and version inputs. */
export function TenantCreate() {
	const client = useApiClient();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: schemasData, isLoading: schemasLoading } = useSchemas();

	const [name, setName] = useState("");
	const [schemaId, setSchemaId] = useState("");
	const [schemaVersion, setSchemaVersion] = useState("");

	const schemas = schemasData?.schemas ?? [];
	const publishedSchemas = schemas.filter((s) => s.published);

	const createMutation = useMutation({
		mutationFn: async () => {
			const { data, error } = await client.POST("/v1/tenants", {
				body: {
					name,
					schemaId,
					schemaVersion: Number(schemaVersion),
				},
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
			const newId = data?.tenant?.id;
			if (newId) {
				navigate(`/tenants/${newId}`);
			} else {
				navigate("/tenants");
			}
		},
	});

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		createMutation.mutate();
	};

	return (
		<div>
			<div className="mb-6">
				<Link to="/tenants" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
					&larr; {label("common.back")} to {label("tenant.plural").toLowerCase()}
				</Link>
			</div>

			<h2 className="mb-6 text-xl font-semibold">{label("tenant.create")}</h2>

			{createMutation.isError && (
				<p className="mb-4 text-red-600 dark:text-red-400">Error: {createMutation.error.message}</p>
			)}

			<form onSubmit={handleSubmit} className="max-w-md space-y-4">
				<div>
					<label htmlFor="tenant-name" className="mb-1 block text-sm font-medium">
						Name
					</label>
					<input
						id="tenant-name"
						type="text"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. acme-corp"
						className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
					/>
					<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Lowercase alphanumeric and hyphens, 1-63 characters.
					</p>
				</div>

				<div>
					<label htmlFor="schema-select" className="mb-1 block text-sm font-medium">
						Schema
					</label>
					<select
						id="schema-select"
						required
						value={schemaId}
						onChange={(e) => setSchemaId(e.target.value)}
						className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
					>
						<option value="">
							{schemasLoading ? label("schema.loadingSchemas") : label("tenant.selectSchema")}
						</option>
						{publishedSchemas.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name} (v{s.version})
							</option>
						))}
					</select>
				</div>

				<div>
					<label htmlFor="schema-version" className="mb-1 block text-sm font-medium">
						Schema Version
					</label>
					<input
						id="schema-version"
						type="number"
						required
						min={1}
						value={schemaVersion}
						onChange={(e) => setSchemaVersion(e.target.value)}
						placeholder="e.g. 1"
						className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
					/>
					<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Must reference a published schema version.
					</p>
				</div>

				<button
					type="submit"
					disabled={createMutation.isPending}
					className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{createMutation.isPending ? label("tenant.creating") : label("tenant.create")}
				</button>
			</form>
		</div>
	);
}

function formatError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message: string }).message);
	}
	return "An unexpected error occurred";
}
