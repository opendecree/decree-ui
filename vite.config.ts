import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	plugins: [react(), tailwindcss()],
	server: {
		proxy: {
			"/v1": {
				target: "http://localhost:8080",
				changeOrigin: true,
			},
		},
	},
});
