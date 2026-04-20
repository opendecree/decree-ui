/**
 * Take screenshots of all pages for visual review and docs.
 *
 * Prerequisites:
 *   - Dev server running: npm run dev
 *   - Backend running at API_URL (default http://localhost:8080)
 *   - Backend seeded with the decree fixtures (see decree/fixtures/)
 *
 * Usage:
 *   npx tsx scripts/screenshots.ts
 *
 * Environment:
 *   BASE_URL   UI dev server URL        (default http://localhost:5174)
 *   API_URL    decree backend URL       (default http://localhost:8080)
 *   OUT_DIR    output directory         (default docs/screenshots)
 *
 * Output: PNG files named <mode>-<page>.png (light + dark).
 */

import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5174";
const API_URL = process.env.API_URL ?? "http://localhost:8080";
const OUT_DIR = process.env.OUT_DIR ?? "docs/screenshots";

const AUTH_HEADERS = { "x-subject": "admin", "x-role": "superadmin" };

interface Named {
	id?: string;
	name?: string;
}

async function fetchNameMap(path: string, key: "schemas" | "tenants"): Promise<Map<string, string>> {
	const res = await fetch(`${API_URL}${path}`, { headers: AUTH_HEADERS });
	if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
	const body = (await res.json()) as Record<string, Named[]>;
	const items = body[key] ?? [];
	return new Map(items.filter((i) => i.id && i.name).map((i) => [i.name as string, i.id as string]));
}

interface ScreenshotPage {
	name: string;
	path: string;
	/** data-testid on the page root — waited for before snapping. */
	testId?: string;
	/** Extra wait time in ms for async data to settle after the testid appears. */
	wait?: number;
}

function buildPages(schemas: Map<string, string>, tenants: Map<string, string>): ScreenshotPage[] {
	const need = (map: Map<string, string>, name: string, kind: string): string => {
		const id = map.get(name);
		if (!id) throw new Error(`${kind} "${name}" not found — seed fixtures first (see decree/fixtures/)`);
		return id;
	};

	const billing = need(schemas, "billing", "schema");
	const showcase = need(schemas, "showcase", "schema");
	const acme = need(tenants, "acme", "tenant");
	const demo = need(tenants, "demo", "tenant");

	return [
		{ name: "home", path: "/", testId: "home-page" },
		{ name: "schemas", path: "/schemas", testId: "schema-list-page" },
		{ name: "schema-billing", path: `/schemas/${billing}`, testId: "schema-detail-page", wait: 300 },
		{ name: "schema-showcase", path: `/schemas/${showcase}`, testId: "schema-detail-page", wait: 300 },
		{ name: "schema-import", path: "/schemas/import" },
		{ name: "tenants", path: "/tenants", testId: "tenant-list-page" },
		{ name: "tenant-demo", path: `/tenants/${demo}`, testId: "tenant-detail-page", wait: 300 },
		{ name: "tenant-acme", path: `/tenants/${acme}`, testId: "tenant-detail-page", wait: 300 },
		{ name: "tenant-create", path: "/tenants/create", wait: 500 },
		{ name: "audit-demo", path: `/tenants/${demo}/audit`, wait: 500 },
		{ name: "usage-demo", path: `/tenants/${demo}/usage`, wait: 500 },
	];
}

async function main() {
	if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

	console.log(`Looking up fixtures at ${API_URL} …`);
	const [schemas, tenants] = await Promise.all([
		fetchNameMap("/v1/schemas", "schemas"),
		fetchNameMap("/v1/tenants", "tenants"),
	]);
	const pages = buildPages(schemas, tenants);

	const browser = await chromium.launch();

	for (const mode of ["light", "dark"] as const) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			colorScheme: mode,
		});

		await context.addInitScript((dark: boolean) => {
			localStorage.setItem("decree-auth", JSON.stringify({ subject: "admin", role: "superadmin" }));
			localStorage.setItem("decree-dark-mode", String(dark));
		}, mode === "dark");

		const page = await context.newPage();

		for (const p of pages) {
			const url = `${BASE_URL}${p.path}`;
			console.log(`${mode}/${p.name}: ${url}`);
			await page.goto(url, { waitUntil: "networkidle" });
			if (p.testId) await page.getByTestId(p.testId).waitFor({ state: "visible" });
			if (p.wait) await page.waitForTimeout(p.wait);
			await page.screenshot({ path: `${OUT_DIR}/${mode}-${p.name}.png`, fullPage: true });
		}

		await context.close();
	}

	await browser.close();
	console.log(`\nScreenshots saved to ${OUT_DIR}/`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
