import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { components } from "../api/schema";
import type { Role } from "../lib/constants";
import { useApiClient, useAuditLog, useVersions } from "../lib/hooks";
import { label } from "../lib/labels";
import { canEditConfig } from "../lib/permissions";
import { FieldChanges } from "./FieldChanges";

type ConfigVersion = components["schemas"]["v1ConfigVersion"];

interface ConfigHistoryProps {
	tenantId: string;
	currentVersion: number | undefined;
	role: Role;
}

/** Config version history with rollback and export/import. */
export function ConfigHistory({ tenantId, currentVersion, role }: ConfigHistoryProps) {
	const client = useApiClient();
	const queryClient = useQueryClient();
	const { data, isLoading } = useVersions(tenantId);
	const versions = data?.versions ?? [];
	const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const rollbackMutation = useMutation({
		mutationFn: async (version: number) => {
			const { error } = await client.POST("/v1/tenants/{tenantId}/versions/{version}:rollback", {
				params: { path: { tenantId, version } },
			});
			if (error) throw new Error(formatError(error));
		},
		onSuccess: () => {
			setRollbackTarget(null);
			queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
			queryClient.invalidateQueries({ queryKey: ["versions", tenantId] });
		},
	});

	const handleExport = useCallback(async () => {
		const { data: result, error } = await client.GET("/v1/tenants/{tenantId}/config/export", {
			params: { path: { tenantId } },
		});
		if (error) return;
		const yaml = result?.yamlContent ?? "";
		const blob = new Blob([yaml], { type: "application/yaml" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `config-${tenantId}.yaml`;
		a.click();
		URL.revokeObjectURL(url);
	}, [client, tenantId]);

	const importMutation = useMutation({
		mutationFn: async (yamlContent: string) => {
			const { error } = await client.POST("/v1/tenants/{tenantId}/config/import", {
				params: { path: { tenantId } },
				body: { yamlContent },
			});
			if (error) throw new Error(formatError(error));
		},
		onSuccess: () => {
			setImportError(null);
			queryClient.invalidateQueries({ queryKey: ["config", tenantId] });
			queryClient.invalidateQueries({ queryKey: ["versions", tenantId] });
		},
		onError: (err: Error) => setImportError(err.message),
	});

	const handleImport = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				importMutation.mutate(reader.result as string);
			};
			reader.readAsText(file);
			e.target.value = "";
		},
		[importMutation],
	);

	return (
		<div>
			{canEditConfig(role) && (
				<div className="mb-4 flex gap-2">
					<button
						type="button"
						onClick={handleExport}
						className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
					>
						{label("config.export")}
					</button>
					<button
						type="button"
						onClick={handleImport}
						className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
					>
						{label("config.import")}
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".yaml,.yml"
						onChange={handleFileChange}
						className="hidden"
					/>
				</div>
			)}

			{importError && (
				<p className="mb-3 text-sm text-red-600 dark:text-red-400">Import failed: {importError}</p>
			)}

			{isLoading && (
				<p className="text-sm text-gray-500 dark:text-gray-400">{label("common.loading")}</p>
			)}

			{!isLoading && versions.length === 0 && (
				<p className="text-sm text-gray-500 dark:text-gray-400">{label("config.noVersions")}</p>
			)}

			{versions.length > 0 && (
				<div className="space-y-2">
					{versions.map((v) => (
						<VersionRow
							key={v.version}
							version={v}
							tenantId={tenantId}
							isCurrent={v.version === currentVersion}
							canRollback={canEditConfig(role) && v.version !== currentVersion}
							isRollbackTarget={rollbackTarget === v.version}
							isRollingBack={rollbackMutation.isPending}
							onRollbackClick={() => setRollbackTarget(v.version ?? null)}
							onRollbackConfirm={() => v.version && rollbackMutation.mutate(v.version)}
							onRollbackCancel={() => setRollbackTarget(null)}
						/>
					))}
				</div>
			)}

			{rollbackMutation.isError && (
				<p className="mt-2 text-sm text-red-600 dark:text-red-400">
					Rollback failed: {rollbackMutation.error.message}
				</p>
			)}
		</div>
	);
}

interface VersionRowProps {
	version: ConfigVersion;
	tenantId: string;
	isCurrent: boolean;
	canRollback: boolean;
	isRollbackTarget: boolean;
	isRollingBack: boolean;
	onRollbackClick: () => void;
	onRollbackConfirm: () => void;
	onRollbackCancel: () => void;
}

function VersionRow({
	version,
	tenantId,
	isCurrent,
	canRollback,
	isRollbackTarget,
	isRollingBack,
	onRollbackClick,
	onRollbackConfirm,
	onRollbackCancel,
}: VersionRowProps) {
	const [expanded, setExpanded] = useState(false);
	const createdAt = version.createdAt ? new Date(version.createdAt).toLocaleString() : "";

	return (
		<div
			className={`rounded border p-3 ${
				isCurrent
					? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30"
					: "border-gray-200 dark:border-gray-800"
			}`}
		>
			<div className="flex items-center justify-between">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setExpanded(!expanded)}
							className="font-mono text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400"
						>
							{expanded ? "▾" : "▸"} v{version.version}
						</button>
						{isCurrent && (
							<span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
								current
							</span>
						)}
					</div>
					<div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
						{version.createdBy && <span>{version.createdBy}</span>}
						{createdAt && <span>{createdAt}</span>}
					</div>
					{version.description && (
						<p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{version.description}</p>
					)}
				</div>

				{canRollback && (
					<div className="ml-4 flex items-center gap-1">
						{isRollbackTarget ? (
							<>
								<button
									type="button"
									onClick={onRollbackConfirm}
									disabled={isRollingBack}
									className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
								>
									{isRollingBack
										? label("config.rollbacking")
										: `${label("config.rollbackConfirm")}${version.version}`}
								</button>
								<button
									type="button"
									onClick={onRollbackCancel}
									className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
								>
									{label("common.cancel")}
								</button>
							</>
						) : (
							<button
								type="button"
								onClick={onRollbackClick}
								className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
							>
								{label("config.rollback")}
							</button>
						)}
					</div>
				)}
			</div>
			{expanded && <VersionDelta tenantId={tenantId} version={version.version} />}
		</div>
	);
}

function VersionDelta({ tenantId, version }: { tenantId: string; version?: number }) {
	const { data, isLoading } = useAuditLog(tenantId, {});
	const entries = (data?.entries ?? []).filter((e) => e.configVersion === version);

	if (isLoading) return <p className="mt-2 text-xs text-gray-400">Loading changes...</p>;
	return (
		<div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
			<FieldChanges entries={entries} />
		</div>
	);
}

function formatError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message: string }).message);
	}
	return "An unexpected error occurred";
}
