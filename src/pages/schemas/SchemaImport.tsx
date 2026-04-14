import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { components } from "../../api/schema";
import { useApiClient } from "../../lib/hooks";
import { label } from "../../lib/labels";

type Schema = components["schemas"]["v1Schema"];

/** Schema import page with YAML textarea and auto-publish option. */
export function SchemaImport() {
	const client = useApiClient();
	const [yaml, setYaml] = useState("");
	const [autoPublish, setAutoPublish] = useState(false);
	const [result, setResult] = useState<Schema | null>(null);

	const importMutation = useMutation({
		mutationFn: async () => {
			const { data, error } = await client.POST("/v1/schemas/import", {
				body: { yamlContent: yaml, autoPublish },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		onSuccess: (data) => {
			setResult(data?.schema ?? null);
		},
	});

	return (
		<div className="mx-auto max-w-2xl">
			<div className="mb-6">
				<Link to="/schemas" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
					&larr; {label("common.back")} to {label("schema.plural").toLowerCase()}
				</Link>
			</div>

			<h2 className="mb-6 text-xl font-semibold">{label("schema.import")}</h2>

			{result && (
				<div className="mb-6 rounded border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/30">
					<p className="font-medium text-green-800 dark:text-green-300">
						Schema imported successfully
					</p>
					<p className="mt-1 text-sm text-green-700 dark:text-green-400">
						{result.name} (v{result.version}) &mdash;{" "}
						<Link to={`/schemas/${result.id}`} className="underline hover:no-underline">
							View schema
						</Link>
					</p>
				</div>
			)}

			{importMutation.isError && (
				<div className="mb-6 rounded border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
					<p className="text-red-800 dark:text-red-300">
						Import failed: {importMutation.error.message}
					</p>
				</div>
			)}

			<div className="mb-4">
				<label htmlFor="yaml-input" className="mb-2 block text-sm font-medium">
					Schema YAML
				</label>
				<textarea
					id="yaml-input"
					value={yaml}
					onChange={(e) => setYaml(e.target.value)}
					rows={16}
					placeholder={`syntax: v1\nname: my-schema\nfields:\n  - path: feature.enabled\n    type: bool`}
					className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-800"
				/>
			</div>

			<div className="mb-6 flex items-center gap-2">
				<input
					id="auto-publish"
					type="checkbox"
					checked={autoPublish}
					onChange={(e) => setAutoPublish(e.target.checked)}
					className="rounded border-gray-300 dark:border-gray-700"
				/>
				<label htmlFor="auto-publish" className="text-sm">
					Auto-publish after import
				</label>
			</div>

			<button
				type="button"
				onClick={() => importMutation.mutate()}
				disabled={!yaml.trim() || importMutation.isPending}
				className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
			>
				{importMutation.isPending ? label("schema.importing") : "Import"}
			</button>
		</div>
	);
}

function formatError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message: string }).message);
	}
	return "An unexpected error occurred";
}
