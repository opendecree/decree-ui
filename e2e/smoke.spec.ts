import { expect, test, API_URL, AUTH_HEADERS } from "./fixtures";

test("superadmin lands on the system overview", async ({ page }) => {
	// E2E auth is role=superadmin, so the index route renders the cross-tenant
	// system overview (not the interim Home). On a fresh backend with no tenants
	// or schemas the page shows its empty state, so assert the page testid (the
	// same load signal the other smoke tests use) rather than data-dependent chrome.
	await page.goto("/");
	await expect(page.getByTestId("system-overview-page")).toBeVisible();
});

test("schemas page loads", async ({ page }) => {
	await page.goto("/schemas");
	await expect(page.getByTestId("schema-list-page")).toBeVisible();
});

test("import schema via UI form", async ({ page }) => {
	await page.goto("/schemas/import");

	const yaml = [
		"spec_version: v1",
		"name: e2e-smoke",
		"fields:",
		"  feature.enabled:",
		"    type: bool",
	].join("\n");

	await page.locator("#yaml-input").fill(yaml);
	await page.locator("#auto-publish").check();
	await page.getByRole("button", { name: "Import" }).click();

	await expect(page.getByText("Schema imported successfully")).toBeVisible();
});

test("imported schema appears in schemas list", async ({ page }) => {
	await page.goto("/schemas");
	await expect(page.getByTestId("schema-list-page")).toBeVisible();
	await expect(page.getByRole("link", { name: "e2e-smoke" })).toBeVisible();
});

test("tenant config page loads", async ({ page, request }) => {
	const yamlB64 = Buffer.from(
		"spec_version: v1\nname: e2e-config\nfields:\n  x:\n    type: string",
	).toString("base64");

	const importRes = await request.post(`${API_URL}/v1/schemas/import`, {
		headers: { ...AUTH_HEADERS, "content-type": "application/json" },
		data: { yamlContent: yamlB64, autoPublish: true },
	});
	expect(importRes.ok()).toBeTruthy();
	const { schema } = await importRes.json();

	const tenantRes = await request.post(`${API_URL}/v1/tenants`, {
		headers: { ...AUTH_HEADERS, "content-type": "application/json" },
		data: { name: "e2e-tenant", schemaId: schema.id, schemaVersion: 1 },
	});
	expect(tenantRes.ok()).toBeTruthy();
	const { tenant } = await tenantRes.json();

	await page.goto(`/tenants/${tenant.id}`);
	await expect(page.getByTestId("config-editor")).toBeVisible();
});

test("tenant switch shows the selected tenant's config", async ({ page, request }) => {
	const yamlB64 = Buffer.from(
		"spec_version: v1\nname: e2e-switch\nfields:\n  y:\n    type: string",
	).toString("base64");

	const importRes = await request.post(`${API_URL}/v1/schemas/import`, {
		headers: { ...AUTH_HEADERS, "content-type": "application/json" },
		data: { yamlContent: yamlB64, autoPublish: true },
	});
	expect(importRes.ok()).toBeTruthy();
	const { schema } = await importRes.json();

	const tenantA = await request.post(`${API_URL}/v1/tenants`, {
		headers: { ...AUTH_HEADERS, "content-type": "application/json" },
		data: { name: "e2e-switch-a", schemaId: schema.id, schemaVersion: 1 },
	});
	expect(tenantA.ok()).toBeTruthy();
	const { tenant: tenantAData } = await tenantA.json();

	const tenantB = await request.post(`${API_URL}/v1/tenants`, {
		headers: { ...AUTH_HEADERS, "content-type": "application/json" },
		data: { name: "e2e-switch-b", schemaId: schema.id, schemaVersion: 1 },
	});
	expect(tenantB.ok()).toBeTruthy();
	const { tenant: tenantBData } = await tenantB.json();

	await page.goto("/tenants");
	await expect(page.getByTestId("tenant-list-page")).toBeVisible();

	await page.getByRole("link", { name: "e2e-switch-a" }).click();
	await expect(page.getByTestId("config-editor")).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/tenants/${tenantAData.id}$`));

	await page.goto("/tenants");
	await page.getByRole("link", { name: "e2e-switch-b" }).click();
	await expect(page.getByTestId("config-editor")).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/tenants/${tenantBData.id}$`));
});

test("API calls succeed through nginx proxy", async ({ page }) => {
	await page.goto("/schemas");

	const result = await page.evaluate(async () => {
		const res = await fetch("/v1/schemas", {
			headers: { "x-subject": "admin", "x-role": "superadmin" },
		});
		return { status: res.status, ok: res.ok };
	});

	expect(result.ok).toBe(true);
	expect(result.status).toBe(200);
});
