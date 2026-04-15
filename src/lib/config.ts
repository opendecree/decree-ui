/** Layout mode controls which navigation levels are visible. */
export type LayoutMode = "full" | "single-schema" | "single-tenant";

/** Runtime config injected by Docker entrypoint (window.__DECREE_UI_CONFIG__). */
interface RuntimeConfig {
	apiUrl?: string;
	layoutMode?: string;
	tenantId?: string;
	schemaId?: string;
}

const runtime: RuntimeConfig =
	(globalThis as Record<string, unknown>).__DECREE_UI_CONFIG__ as RuntimeConfig ?? {};

/** App configuration — runtime (Docker) values take precedence over build-time (Vite) values. */
export const config = {
	/** Base URL for API calls. Empty = same origin (proxied in dev/Docker). */
	apiUrl: runtime.apiUrl || import.meta.env.VITE_API_URL || "",

	/** Layout mode. */
	layoutMode: (runtime.layoutMode || import.meta.env.VITE_LAYOUT_MODE || "full") as LayoutMode,

	/** Pre-selected tenant ID for single-tenant mode. */
	tenantId: runtime.tenantId || (import.meta.env.VITE_TENANT_ID as string | undefined),

	/** Pre-selected schema ID for single-schema mode. */
	schemaId: runtime.schemaId || (import.meta.env.VITE_SCHEMA_ID as string | undefined),
} as const;
