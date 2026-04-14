/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_LAYOUT_MODE: string;
	readonly VITE_TENANT_ID: string;
	readonly VITE_SCHEMA_ID: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
