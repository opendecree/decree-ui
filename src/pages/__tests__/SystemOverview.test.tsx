import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemOverview } from "../SystemOverview";

/**
 * The overview reads five hooks: useTenants + useSchemas (top-level) and, per
 * tenant, useAuditLog + useUnusedFields (via the hidden collectors). The mocks
 * key the per-tenant hooks off the tenantId argument so each tenant gets its own
 * audit/unused signal — exercising the aggregation + per-row chips.
 */
const ACME = "11111111-1111-1111-1111-111111111111";
const GLOBEX = "22222222-2222-2222-2222-222222222222";
const SHOWCASE = "aaaaaaaa-0000-0000-0000-000000000001";
const BILLING = "bbbbbbbb-0000-0000-0000-000000000002";
const DRAFT = "cccccccc-0000-0000-0000-000000000003";

const tenants = [
	{
		id: ACME,
		name: "acme-corp",
		schemaId: SHOWCASE,
		schemaVersion: 1,
		updatedAt: "2026-06-14T09:12:00Z",
	},
	{
		id: GLOBEX,
		name: "globex",
		schemaId: BILLING,
		schemaVersion: 4,
		updatedAt: "2026-06-09T11:05:00Z",
	},
];

const schemas = [
	{ id: SHOWCASE, name: "showcase", version: 1, published: true, fields: [{}, {}, {}] },
	{ id: BILLING, name: "billing", version: 4, published: true, fields: [{}, {}] },
	{ id: DRAFT, name: "payments-v2", version: 1, published: false, fields: [{}] },
];

// Per-tenant audit + unused, keyed by tenant id.
const defaultAudit: Record<string, { entries: unknown[] }> = {
	[ACME]: { entries: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] },
	[GLOBEX]: { entries: [{ id: "b1" }] },
};
const defaultUnused: Record<string, { fieldPaths: string[] }> = {
	[ACME]: { fieldPaths: ["legacy.old_fee"] }, // 1 unused
	[GLOBEX]: { fieldPaths: [] }, // clean
};

const hookState = {
	tenants: { data: { tenants }, isLoading: false, error: null as Error | null },
	schemas: { data: { schemas }, isLoading: false, error: null as Error | null },
	perTenantSettled: true,
	audit: defaultAudit as Record<string, { entries: unknown[] }>,
	unused: defaultUnused as Record<string, { fieldPaths: string[] }>,
};

vi.mock("../../lib/hooks", () => ({
	useTenants: () => hookState.tenants,
	useSchemas: () => hookState.schemas,
	useAuditLog: (tenantId: string) => ({
		data: hookState.audit[tenantId] ?? { entries: [] },
		isSuccess: hookState.perTenantSettled,
		isError: false,
	}),
	useUnusedFields: (tenantId: string) => ({
		data: hookState.unused[tenantId] ?? { fieldPaths: [] },
		isSuccess: hookState.perTenantSettled,
		isError: false,
	}),
}));

function renderOverview() {
	return render(
		<MemoryRouter>
			<SystemOverview />
		</MemoryRouter>,
	);
}

afterEach(() => {
	hookState.tenants = { data: { tenants }, isLoading: false, error: null };
	hookState.schemas = { data: { schemas }, isLoading: false, error: null };
	hookState.perTenantSettled = true;
	hookState.audit = defaultAudit;
	hookState.unused = defaultUnused;
	vi.clearAllMocks();
});

describe("SystemOverview", () => {
	it("renders the page heading and subtitle", () => {
		renderOverview();
		expect(screen.getByTestId("system-overview-page")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "System overview" })).toBeInTheDocument();
		expect(screen.getByText(/all tenants · all schemas/)).toBeInTheDocument();
	});

	it("summarises tenant and schema counts in the stat strip", () => {
		renderOverview();
		// 2 tenants on 2 published schemas
		const tenantsStat = screen.getByText("tenants").closest("div");
		expect(tenantsStat).not.toBeNull();
		expect(within(tenantsStat as HTMLElement).getByText("2")).toBeInTheDocument();
		expect(
			within(tenantsStat as HTMLElement).getByText(/on 2 published schemas/),
		).toBeInTheDocument();

		// schemas: 2 published, +1 draft
		const schemaStat = screen.getByText("schemas").closest("div");
		expect(within(schemaStat as HTMLElement).getByText("+1 draft")).toBeInTheDocument();
		expect(within(schemaStat as HTMLElement).getByText("3 total")).toBeInTheDocument();
	});

	it("lists each tenant with its bound schema name + version and config link", () => {
		renderOverview();
		// The tenant's config link points at its editor.
		const acmeConfigLink = screen
			.getAllByRole("link", { name: /acme-corp/ })
			.find((l) => l.getAttribute("href") === `/tenants/${ACME}`);
		expect(acmeConfigLink).toBeDefined();
		// schema name resolved from the schema list, not the raw UUID. It appears
		// both in the tenant's schema column and (as a link) in the schema table.
		expect(screen.getAllByText("showcase").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("billing").length).toBeGreaterThanOrEqual(1);
		// the bound version is shown next to the tenant's schema
		const acmeRow = (acmeConfigLink as HTMLElement).closest("tr");
		expect(within(acmeRow as HTMLElement).getByText("v1")).toBeInTheDocument();
	});

	it("renders per-tenant chain chips as 'active' (never claiming 'verified')", () => {
		renderOverview();
		// One chip per tenant row (2). A 'verified' claim is never made anywhere.
		const chips = screen.getAllByText("active");
		// strip stat may also read 'active' — at least the two row chips exist
		expect(chips.length).toBeGreaterThanOrEqual(2);
		const rowChip = chips.find((c) =>
			c.closest("span")?.getAttribute("title")?.includes("not yet exposed by the REST gateway"),
		);
		expect(rowChip).toBeDefined();
		expect(screen.queryByText("verified")).toBeNull();
	});

	it("flags tenants with unused fields and marks clean ones", () => {
		renderOverview();
		// acme has 1 unused; globex is clean
		expect(screen.getAllByText("1 unused").length).toBeGreaterThan(0);
		expect(screen.getByText("clean")).toBeInTheDocument();
	});

	it("aggregates governance + audit totals across tenants in the strip", () => {
		renderOverview();
		// total unused = 1 (acme) + 0 (globex)
		const govStat = screen.getByText("governance").closest("div");
		expect(within(govStat as HTMLElement).getByText("1")).toBeInTheDocument();

		// audit chain stat: 3 + 1 = 4 entries, chain "active"
		const chainStat = screen.getByText("audit chain").closest("div");
		expect(within(chainStat as HTMLElement).getByText("active")).toBeInTheDocument();
		expect(within(chainStat as HTMLElement).getByText(/4 entries/)).toBeInTheDocument();
	});

	it("renders the schema lifecycle table with status + bound-tenant counts", () => {
		renderOverview();
		const schemaLink = screen.getByRole("link", { name: /payments-v2/ });
		expect(schemaLink).toHaveAttribute("href", `/schemas/${DRAFT}`);
		expect(screen.getAllByText("published").length).toBe(2);
		expect(screen.getByText("draft")).toBeInTheDocument();
		// showcase bound to 1 tenant (acme): scope to the schema-detail link's row.
		const showcaseLink = screen.getByRole("link", { name: /showcase/ });
		const showcaseRow = showcaseLink.closest("tr");
		expect(showcaseRow).not.toBeNull();
		// fields = 3, bound tenants = 1 — both present in the row
		expect(within(showcaseRow as HTMLElement).getByText("3")).toBeInTheDocument();
		expect(within(showcaseRow as HTMLElement).getByText("1")).toBeInTheDocument();
		// the draft has no bound-tenant count
		const draftRow = schemaLink.closest("tr");
		expect(within(draftRow as HTMLElement).getByText("draft")).toBeInTheDocument();
	});

	it("states the honest chain limitation + names the server follow-up signal", () => {
		renderOverview();
		expect(screen.getByText(/SHA-256 linked · epoch 1/)).toBeInTheDocument();
		// The broken-chain panel degrades to a pending-server note (no VerifyChain
		// RPC on the gateway). The note names the limitation and the follow-up RPC;
		// it spans a <code> element, so match on the testid container's text.
		const pending = screen.getByTestId("chain-break-pending");
		expect(pending).toHaveTextContent(/not yet exposed by the REST gateway/);
		expect(pending).toHaveTextContent(/VerifyChain/);
		// No tamper detail is rendered when there is no break data.
		expect(screen.queryByTestId("chain-break-panel")).toBeNull();
	});

	it("links flagged tenants to their usage page in the governance panel", () => {
		renderOverview();
		// acme is flagged (1 unused) → its governance-panel link targets /usage.
		const usageLinks = screen
			.getAllByRole("link")
			.filter((l) => l.getAttribute("href") === `/tenants/${ACME}/usage`);
		expect(usageLinks.length).toBe(1);
		// globex is clean → no usage link for it.
		const globexUsage = screen
			.getAllByRole("link")
			.filter((l) => l.getAttribute("href") === `/tenants/${GLOBEX}/usage`);
		expect(globexUsage.length).toBe(0);
	});

	it("shows a skeleton while the top-level queries load", () => {
		hookState.tenants = { data: undefined as never, isLoading: true, error: null };
		hookState.schemas = { data: undefined as never, isLoading: true, error: null };
		renderOverview();
		// stat strip text absent while loading
		expect(screen.queryByText("audit chain")).toBeNull();
	});

	it("renders an error message when the tenant query fails", () => {
		hookState.tenants = {
			data: undefined as never,
			isLoading: false,
			error: new Error("boom"),
		};
		renderOverview();
		expect(screen.getByText(/Error loading overview: boom/)).toBeInTheDocument();
	});

	it("renders an empty state when there are no tenants or schemas", () => {
		hookState.tenants = { data: { tenants: [] }, isLoading: false, error: null };
		hookState.schemas = { data: { schemas: [] }, isLoading: false, error: null };
		renderOverview();
		expect(screen.getByText("No tenants or schemas yet.")).toBeInTheDocument();
	});

	it("shows placeholder chips while per-tenant signals are still settling", () => {
		hookState.perTenantSettled = false;
		renderOverview();
		// chips render the ellipsis placeholder; no 'active'/'clean' yet
		expect(screen.queryByText("active")).toBeNull();
		expect(screen.queryByText("clean")).toBeNull();
		expect(screen.getByText("Scanning usage…")).toBeInTheDocument();
	});

	it("uses singular wording for a single tenant / single audit entry", () => {
		hookState.tenants = { data: { tenants: [tenants[0]] }, isLoading: false, error: null };
		hookState.schemas = {
			data: { schemas: [schemas[0]] },
			isLoading: false,
			error: null,
		};
		hookState.audit = { [ACME]: { entries: [{ id: "only" }] } };
		hookState.unused = { [ACME]: { fieldPaths: [] } };
		renderOverview();
		// "on 1 published schema" (singular), "1 entry" (singular), "1 chain" (singular)
		expect(screen.getByText(/on 1 published schema\b/)).toBeInTheDocument();
		expect(screen.getByText(/1 entry · tamper-evident/)).toBeInTheDocument();
		// the chain panel's <b> renders the singular "1 chain"
		expect(screen.getByText("1 chain")).toBeInTheDocument();
	});

	it("orders flagged tenants by unused-field count, highest first", () => {
		// acme: 1 unused, globex: 3 unused → globex should sort above acme.
		hookState.unused = {
			[ACME]: { fieldPaths: ["a.one"] },
			[GLOBEX]: { fieldPaths: ["g.one", "g.two", "g.three"] },
		};
		renderOverview();
		const usageLinks = screen
			.getAllByRole("link")
			.filter((l) => l.getAttribute("href")?.endsWith("/usage"));
		expect(usageLinks.map((l) => l.getAttribute("href"))).toEqual([
			`/tenants/${GLOBEX}/usage`,
			`/tenants/${ACME}/usage`,
		]);
		// governance total in the strip = 1 + 3 = 4
		const govStat = screen.getByText("governance").closest("div");
		expect(within(govStat as HTMLElement).getByText("4")).toBeInTheDocument();
	});
});
