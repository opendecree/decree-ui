/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_LAYOUT_MODE: string;
	readonly VITE_TENANT_ID: string;
	readonly VITE_SCHEMA_ID: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
