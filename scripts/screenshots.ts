/**
 * Take screenshots of all pages for visual review.
 *
 * Prerequisites:
 *   - Dev server running: npm run dev
 *   - Backend running with fixtures loaded
 *
 * Usage:
 *   npx tsx scripts/screenshots.ts
 *
 * Output: screenshots/ directory with PNG files.
 */

import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const BASE_URL = "http://localhost:5173";
const OUT_DIR = "screenshots";

// IDs from fixtures — update if you reseed.
const SCHEMA_BILLING = "55d65371-3750-41fa-a724-7b4fbe90f9b3";
const SCHEMA_SHOWCASE = "48cbf8ce-e37c-428e-af72-8de18f0a7af5";
const TENANT_ACME = "ae0848c3-f0e8-421a-950c-652dc6dc2d11";
const TENANT_DEMO = "35e49c9b-83ff-43d5-9e22-e4998971e479";
const TENANT_BLANK = "d3aefa9a-aff5-4629-b69b-b5ac2ab01f78";

interface Page {
	name: string;
	path: string;
	/** Extra wait time in ms for async data to load. */
	wait?: number;
}

const pages: Page[] = [
	{ name: "home", path: "/" },
	{ name: "schemas", path: "/schemas" },
	{ name: "schema-billing", path: `/schemas/${SCHEMA_BILLING}`, wait: 500 },
	{ name: "schema-showcase", path: `/schemas/${SCHEMA_SHOWCASE}`, wait: 500 },
	{ name: "schema-import", path: "/schemas/import" },
	{ name: "tenants", path: "/tenants" },
	{ name: "tenant-acme", path: `/tenants/${TENANT_ACME}`, wait: 500 },
	{ name: "tenant-create", path: "/tenants/create", wait: 500 },
	{ name: "config-acme", path: `/tenants/${TENANT_ACME}/config`, wait: 1000 },
	{ name: "config-demo", path: `/tenants/${TENANT_DEMO}/config`, wait: 1000 },
	{ name: "config-blank", path: `/tenants/${TENANT_BLANK}/config`, wait: 1000 },
];

async function main() {
	if (!existsSync(OUT_DIR)) {
		mkdirSync(OUT_DIR, { recursive: true });
	}

	const browser = await chromium.launch();

	for (const mode of ["light", "dark"] as const) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			colorScheme: mode,
		});

		// Set auth in localStorage before navigating.
		await context.addInitScript(() => {
			localStorage.setItem("decree-auth", JSON.stringify({ subject: "admin", role: "superadmin" }));
			if (document.documentElement) {
				// Dark mode class will be set by the app on load.
			}
		});

		// For dark mode, also set the preference.
		if (mode === "dark") {
			await context.addInitScript(() => {
				localStorage.setItem("decree-dark-mode", "true");
			});
		} else {
			await context.addInitScript(() => {
				localStorage.setItem("decree-dark-mode", "false");
			});
		}

		const page = await context.newPage();

		for (const p of pages) {
			const url = `${BASE_URL}${p.path}`;
			console.log(`${mode}/${p.name}: ${url}`);

			await page.goto(url, { waitUntil: "networkidle" });
			if (p.wait) {
				await page.waitForTimeout(p.wait);
			}

			await page.screenshot({
				path: `${OUT_DIR}/${mode}-${p.name}.png`,
				fullPage: true,
			});
		}

		await context.close();
	}

	await browser.close();
	console.log(`\nScreenshots saved to ${OUT_DIR}/`);
}

main().catch(console.error);
