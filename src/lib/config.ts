/** Layout mode controls which navigation levels are visible. */
export type LayoutMode = "full" | "single-schema" | "single-tenant";

/** Runtime config injected by Docker entrypoint (window.__DECREE_UI_CONFIG__). */
interface RuntimeConfig {
	apiUrl?: string;
	layoutMode?: string;
	tenantId?: string;
	schemaId?: string;
	defaultRole?: string;
	defaultSubject?: string;
	logoUrl?: string;
	appName?: string;
}

const runtime: RuntimeConfig =
	((globalThis as Record<string, unknown>).__DECREE_UI_CONFIG__ as RuntimeConfig) ?? {};

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

	/** Default role for auth headers. Empty = superadmin (see constants.ts). */
	defaultRole: runtime.defaultRole || import.meta.env.VITE_DEFAULT_ROLE || "",

	/** Default subject for auth headers. Empty = "admin" (see constants.ts). */
	defaultSubject: runtime.defaultSubject || import.meta.env.VITE_DEFAULT_SUBJECT || "",

	/** Logo URL. Empty = default OpenDecree favicon. */
	logoUrl: runtime.logoUrl || import.meta.env.VITE_LOGO_URL || "",

	/** App name override. Empty = uses labels.json "app.name". */
	appName: runtime.appName || import.meta.env.VITE_APP_NAME || "",
} as const;
