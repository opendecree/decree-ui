import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type ApiClient, createApiClient } from "../api/client";
import { useAuth } from "./auth";

/** Create an API client from the current auth context. */
export function useApiClient(): ApiClient {
	const { auth } = useAuth();
	return useMemo(() => createApiClient(auth), [auth]);
}

/** Fetch all schemas via GET /v1/schemas. */
export function useSchemas() {
	const client = useApiClient();
	return useQuery({
		queryKey: ["schemas"],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/schemas");
			if (error) throw new Error(formatError(error));
			return data;
		},
	});
}

/** Fetch a single schema via GET /v1/schemas/{id}. */
export function useSchema(id: string) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["schemas", id],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/schemas/{id}", {
				params: { path: { id } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!id,
	});
}

/** Fetch all tenants via GET /v1/tenants. */
export function useTenants() {
	const client = useApiClient();
	return useQuery({
		queryKey: ["tenants"],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/tenants");
			if (error) throw new Error(formatError(error));
			return data;
		},
	});
}

/** Fetch a single tenant via GET /v1/tenants/{id}. */
export function useTenant(id: string) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["tenants", id],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/tenants/{id}", {
				params: { path: { id } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!id,
	});
}

/** Fetch a schema by ID at a specific version via GET /v1/schemas/{id}?version={version}. */
export function useSchemaVersion(schemaId: string, version: number | undefined) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["schemas", schemaId, version],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/schemas/{id}", {
				params: { path: { id: schemaId }, query: { version } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!schemaId && version !== undefined,
	});
}

/** Fetch the full resolved config for a tenant via GET /v1/tenants/{tenantId}/config. */
export function useConfig(tenantId: string) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["config", tenantId],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/tenants/{tenantId}/config", {
				params: { path: { tenantId } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!tenantId,
	});
}

/** Fetch all field locks for a tenant via GET /v1/tenants/{tenantId}/locks. */
export function useFieldLocks(tenantId: string) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["locks", tenantId],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/tenants/{tenantId}/locks", {
				params: { path: { tenantId } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!tenantId,
	});
}

/** Fetch config version history for a tenant via GET /v1/tenants/{tenantId}/versions. */
export function useVersions(tenantId: string) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["versions", tenantId],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/tenants/{tenantId}/versions", {
				params: { path: { tenantId } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!tenantId,
	});
}

/** Fetch config at a specific version via GET /v1/tenants/{tenantId}/versions/{version}. */
export function useConfigAtVersion(tenantId: string, version: number | undefined) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["config", tenantId, "v", version],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/tenants/{tenantId}/versions/{version}", {
				params: { path: { tenantId, version: version as number } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!tenantId && version !== undefined,
	});
}

/** Fetch audit log entries for a tenant. */
export function useAuditLog(tenantId: string, filters?: { fieldPath?: string; actor?: string }) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["audit", tenantId, filters],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/audit/logs", {
				params: { query: { tenantId, ...filters, pageSize: 50 } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!tenantId,
	});
}

/** Fetch tenant-level usage stats. */
export function useTenantUsage(tenantId: string) {
	const client = useApiClient();
	return useQuery({
		queryKey: ["usage", tenantId],
		queryFn: async () => {
			const { data, error } = await client.GET("/v1/tenants/{tenantId}/usage", {
				params: { path: { tenantId } },
			});
			if (error) throw new Error(formatError(error));
			return data;
		},
		enabled: !!tenantId,
	});
}

/** Extract a useful message from an API error response. */
function formatError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		return String((error as { message: string }).message);
	}
	return "An unexpected error occurred";
}
