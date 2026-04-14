/** Layout mode controls which navigation levels are visible. */
export type LayoutMode = "full" | "single-schema" | "single-tenant";

/** App configuration from environment variables. */
export const config = {
	/** Base URL for API calls. Empty = same origin (proxied in dev). */
	apiUrl: import.meta.env.VITE_API_URL ?? "",

	/** Layout mode. */
	layoutMode: (import.meta.env.VITE_LAYOUT_MODE ?? "full") as LayoutMode,

	/** Pre-selected tenant ID for single-tenant mode. */
	tenantId: import.meta.env.VITE_TENANT_ID as string | undefined,

	/** Pre-selected schema ID for single-schema mode. */
	schemaId: import.meta.env.VITE_SCHEMA_ID as string | undefined,
} as const;
