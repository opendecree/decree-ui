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

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5174";
const OUT_DIR = "screenshots";

// IDs from fixtures — update if you reseed.
const SCHEMA_BILLING = "5c66e344-6d24-4182-a632-052c8383bbd0";
const SCHEMA_SHOWCASE = "3449dec3-ca10-4ef5-b4b4-b55afbbfd3c1";
const TENANT_ACME = "7593edc7-d109-45d5-a6df-057365e2b0f2";
const TENANT_DEMO = "90695376-db8e-4804-9b51-bd812e04bd71";
const TENANT_BLANK = "a4037ec8-53dc-48f9-bdac-3bd2ab1e90f7";

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
	{ name: "tenant-demo", path: `/tenants/${TENANT_DEMO}`, wait: 500 },
	{ name: "tenant-acme", path: `/tenants/${TENANT_ACME}`, wait: 500 },
	{ name: "tenant-create", path: "/tenants/create", wait: 500 },
	{ name: "audit-demo", path: `/tenants/${TENANT_DEMO}/audit`, wait: 500 },
	{ name: "usage-demo", path: `/tenants/${TENANT_DEMO}/usage`, wait: 500 },
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
