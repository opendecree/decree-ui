import { test as base, type Page } from "@playwright/test";

export const API_URL = process.env.API_URL ?? "http://localhost:8080";
export const AUTH_HEADERS = { "x-subject": "admin", "x-role": "superadmin" };

async function injectAuth(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem(
			"decree-auth",
			JSON.stringify({ subject: "admin", role: "superadmin" }),
		);
	});
}

export const test = base.extend<{ page: Page }>({
	page: async ({ page }, use) => {
		await injectAuth(page);
		await use(page);
	},
});

export { expect } from "@playwright/test";
