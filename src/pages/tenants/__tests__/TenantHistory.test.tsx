import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "../../../api/schema";
import { AuthContext, type AuthContextValue } from "../../../lib/auth";
import type { Role } from "../../../lib/constants";
import { ToastProvider } from "../../../lib/toast";
import { TenantHistory } from "../TenantHistory";

type SchemaField = components["schemas"]["v1SchemaField"];
type ConfigVersion = components["schemas"]["v1ConfigVersion"];
type AuditEntry = components["schemas"]["v1AuditEntry"];

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const tenant = { id: TENANT_ID, name: "Acme Corp", schemaId: "s1", schemaVersion: 1 };

const fields: SchemaField[] = [
	{ path: "app.name", type: "FIELD_TYPE_STRING" },
	{ path: "payments.fee_rate", type: "FIELD_TYPE_NUMBER" },
	{ path: "payments.enabled", type: "FIELD_TYPE_BOOL" },
	{ path: "payments.retries", type: "FIELD_TYPE_INT" },
	{ path: "settlement.window", type: "FIELD_TYPE_DURATION" },
	{ path: "flags.cutover", type: "FIELD_TYPE_TIME" },
	{ path: "api.webhook_url", type: "FIELD_TYPE_URL" },
	{ path: "api.rate_limits", type: "FIELD_TYPE_JSON", sensitive: true },
];

// Newest first, mixing set / rollback / create so the timeline badges render.
// v2 uses the spaced "roll back" spelling; v1 has no "initial"/version marker but
// is version 1 → still classified as a create (exercises the version===1 branch).
const versions: ConfigVersion[] = [
	{
		version: 8,
		description: "Re-enable payments module",
		createdBy: "carol@acme",
		createdAt: "2026-06-15T10:01:00Z",
	},
	{ version: 7, description: "Bump fee rate for Q2", createdBy: "alice@acme" },
	{ version: 6, description: "Enable payments module", createdBy: "alice@acme" },
	{ version: 5, description: "Rollback to version 3", createdBy: "bob@acme" },
	// v4 has no audit deltas in the fixture → exercises the empty-diff state.
	{ version: 4, description: "No-op administrative bump", createdBy: "bob@acme" },
	{ version: 3, description: "Initial production values", createdBy: "alice@acme" },
	{ version: 2, description: "Roll back to version 1", createdBy: "bob@acme" },
	{ version: 1, description: "", createdBy: undefined },
];

// Audit entries, tagged with the config version they produced.
const auditEntries: AuditEntry[] = [
	{ fieldPath: "payments.enabled", oldValue: "false", newValue: "true", configVersion: 8 },
	{ fieldPath: "app.name", oldValue: "MyApp", newValue: "OpenDecree Demo", configVersion: 7 },
	{ fieldPath: "payments.fee_rate", oldValue: "1.0", newValue: "2.5", configVersion: 7 },
	// A removed field at v6 → exercises the "removed" change-type + empty new side.
	{ fieldPath: "settlement.window", oldValue: "48h", configVersion: 6 },
	{ fieldPath: "payments.retries", newValue: "3", configVersion: 6 },
	{ fieldPath: "api.rate_limits", newValue: "[REDACTED]", configVersion: 6 },
	{
		fieldPath: "api.webhook_url",
		oldValue: "https://staging.example.com/wh",
		newValue: "https://old.example.com/wh",
		configVersion: 5,
	},
	// A no-field rollback marker entry → must be skipped by the diff builder.
	{ action: "rollback", newValue: "v3", configVersion: 5 },
	{ fieldPath: "app.name", newValue: "MyApp", configVersion: 3 },
	{ fieldPath: "payments.fee_rate", newValue: "1.0", configVersion: 3 },
	{ fieldPath: "flags.cutover", newValue: "2025-01-15T09:30:00Z", configVersion: 1 },
	// An entry with no configVersion → must be excluded from the per-version grouping.
	{ fieldPath: "app.name", newValue: "stray", actor: "system" },
];

// Current resolved config (v8). One value per oneof member, so valueString covers
// every type branch. webhook_url currently differs from its v5 value (and is
// locked), so a rollback to v5 would re-write it.
const configValues = [
	{ fieldPath: "payments.enabled", value: { boolValue: true } },
	{ fieldPath: "app.name", value: { stringValue: "OpenDecree Demo" } },
	{ fieldPath: "payments.fee_rate", value: { numberValue: 2.5 } },
	{ fieldPath: "payments.retries", value: { integerValue: "3" } },
	{ fieldPath: "settlement.window", value: { durationValue: "24h" } },
	{ fieldPath: "flags.cutover", value: { timeValue: "2025-01-15T09:30:00Z" } },
	{ fieldPath: "api.webhook_url", value: { urlValue: "https://current.example.com/wh" } },
	{ fieldPath: "api.rate_limits", value: { jsonValue: "[REDACTED]" } },
	{ fieldPath: "orphan.novalue", value: {} }, // empty oneof → valueString "" fallback
	{ fieldPath: "orphan.missing" }, // no value at all → skipped
];

// Mutable per-test state so loading / error / empty branches can be exercised.
const state = {
	tenant: { data: { tenant }, isLoading: false, error: null as Error | null },
	versions: { data: { versions } as { versions?: ConfigVersion[] }, isLoading: false },
	config: { data: { config: { version: 8 as number | undefined, values: configValues } } },
	audit: { data: { entries: auditEntries } },
	locks: { data: { locks: [] as { fieldPath: string }[] } },
};
const mockClient = { POST: vi.fn(), GET: vi.fn() };

vi.mock("../../../lib/hooks", () => ({
	useApiClient: () => mockClient,
	useTenant: () => state.tenant,
	useSchemaVersion: () => ({ data: { schema: { name: "showcase", fields } }, isLoading: false }),
	useVersions: () => state.versions,
	useConfig: () => state.config,
	useAuditLog: () => state.audit,
	useFieldLocks: () => state.locks,
}));

beforeEach(() => {
	state.tenant = { data: { tenant }, isLoading: false, error: null };
	state.versions = { data: { versions }, isLoading: false };
	state.config = { data: { config: { version: 8, values: configValues } } };
	state.audit = { data: { entries: auditEntries } };
	state.locks = { data: { locks: [] } };
	mockClient.POST.mockReset();
	mockClient.GET.mockReset();
});

function renderHistory(role: Role = "admin") {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	function Harness({ children }: { children: ReactNode }) {
		const [auth] = useState({ subject: "carol", role, tenantId: TENANT_ID });
		const ctx: AuthContextValue = { auth, setAuth: () => {} };
		return <AuthContext value={ctx}>{children}</AuthContext>;
	}
	return render(
		<QueryClientProvider client={qc}>
			<ToastProvider>
				<Harness>
					<MemoryRouter initialEntries={[`/tenants/${TENANT_ID}/history`]}>
						<Routes>
							<Route path="/tenants/:id/history" element={<TenantHistory />} />
						</Routes>
					</MemoryRouter>
				</Harness>
			</ToastProvider>
		</QueryClientProvider>,
	);
}

/** Select a timeline version by its number. */
function selectVersion(v: number) {
	fireEvent.click(screen.getByTestId(`version-${v}`));
}

/** Open the rollback modal for the currently-selected (non-current) version. */
function openRollback() {
	fireEvent.click(screen.getByTestId("rollback-button"));
	return screen.getByTestId("rollback-modal");
}

describe("TenantHistory — render + timeline", () => {
	it("renders the tenant + schema header and a timeline item per version", () => {
		renderHistory();
		expect(screen.getByTestId("tenant-history")).toBeInTheDocument();
		// Name + schema + current version live in one header line (adjacent text nodes).
		expect(screen.getByText(/Acme Corp · showcase v1 · config v8/)).toBeInTheDocument();
		const timeline = screen.getByTestId("version-timeline");
		for (const v of [8, 7, 6, 5, 4, 3, 2, 1]) {
			expect(within(timeline).getByTestId(`version-${v}`)).toBeInTheDocument();
		}
	});

	it("marks the current version and shows action badges for create/rollback", () => {
		renderHistory();
		// v8 is current and selected by default.
		const v8 = screen.getByTestId("version-8");
		expect(within(v8).getByText("current")).toBeInTheDocument();
		expect(v8).toHaveAttribute("aria-pressed", "true");
		// v3 = create badge, v5 = rollback badge.
		expect(within(screen.getByTestId("version-3")).getByText("create")).toBeInTheDocument();
		expect(within(screen.getByTestId("version-5")).getByText("rollback")).toBeInTheDocument();
	});

	it("defaults the diff to the newest version against its predecessor", () => {
		renderHistory();
		const pane = screen.getByTestId("diff-pane");
		// v8 modifies payments.enabled only.
		expect(within(pane).getByTestId("diff-payments.enabled")).toBeInTheDocument();
		expect(within(pane).getByTestId("diff-summary")).toHaveTextContent("1 field changed");
	});
});

describe("TenantHistory — diff rendering", () => {
	it("shows a per-field old→new diff with the change-type tag", () => {
		renderHistory();
		selectVersion(7);
		const row = screen.getByTestId("diff-payments.fee_rate");
		expect(within(row).getByText("modified")).toBeInTheDocument();
		expect(within(screen.getByTestId("diff-payments.fee_rate-old")).getByText("1.0")).toBeTruthy();
		expect(within(screen.getByTestId("diff-payments.fee_rate-new")).getByText("2.5")).toBeTruthy();
	});

	it("renders an added field with a 'did not exist' old side", () => {
		renderHistory();
		selectVersion(6);
		const row = screen.getByTestId("diff-payments.retries");
		expect(within(row).getByText("added")).toBeInTheDocument();
		expect(
			within(screen.getByTestId("diff-payments.retries-old")).getByText(/did not exist/),
		).toBeInTheDocument();
		expect(within(screen.getByTestId("diff-payments.retries-new")).getByText("3")).toBeTruthy();
	});

	it("keeps a sensitive field [REDACTED] on BOTH sides of the diff", () => {
		renderHistory();
		selectVersion(6);
		const row = screen.getByTestId("diff-api.rate_limits");
		expect(within(row).getByText("sensitive")).toBeInTheDocument();
		// Both the old and the new value cells render the redaction, never cleartext.
		const oldCell = screen.getByTestId("diff-api.rate_limits-old");
		const newCell = screen.getByTestId("diff-api.rate_limits-new");
		// "added" → old side is the empty placeholder; new side must be redacted.
		expect(within(newCell).getByText("[REDACTED]")).toBeInTheDocument();
		// The empty/placeholder side must not leak a value either.
		expect(within(oldCell).queryByText(/example|http|\{/)).toBeNull();
	});

	it("shows the empty-diff state when a version has no field changes", () => {
		renderHistory();
		selectVersion(4); // v4 has no audit deltas in the fixture
		expect(screen.getByTestId("diff-empty")).toBeInTheDocument();
		expect(screen.getByTestId("diff-summary")).toHaveTextContent("0 fields changed");
	});
});

describe("TenantHistory — rollback gating", () => {
	it("offers rollback to an admin on a non-current version", () => {
		renderHistory("admin");
		selectVersion(7);
		expect(screen.getByTestId("rollback-button")).toBeInTheDocument();
	});

	it("hides rollback on the current version", () => {
		renderHistory("admin");
		// v8 is current + selected by default.
		expect(screen.queryByTestId("rollback-button")).toBeNull();
	});

	it("never offers rollback to a user (absent, not disabled)", () => {
		renderHistory("user");
		selectVersion(7);
		expect(screen.queryByTestId("rollback-button")).toBeNull();
	});

	it("offers rollback to a superadmin on a non-current version", () => {
		renderHistory("superadmin");
		selectVersion(7);
		expect(screen.getByTestId("rollback-button")).toBeInTheDocument();
	});
});

describe("TenantHistory — re-guard prediction (client-side mirror)", () => {
	it("warns before the round-trip when a restored field is locked (admin)", () => {
		state.locks = { data: { locks: [{ fieldPath: "api.webhook_url" }] } };
		renderHistory("admin");
		selectVersion(5); // v5 set webhook_url to a value differing from current → re-write
		openRollback();
		const warning = screen.getByTestId("rollback-warning");
		expect(warning).toHaveTextContent(/rejected atomically/i);
		expect(within(warning).getByText("api.webhook_url")).toBeInTheDocument();
		expect(within(warning).getByText("locked")).toBeInTheDocument();
	});

	it("shows no re-guard warning for a superadmin who bypasses the lock", () => {
		state.locks = { data: { locks: [{ fieldPath: "api.webhook_url" }] } };
		renderHistory("superadmin");
		selectVersion(5);
		openRollback();
		expect(screen.queryByTestId("rollback-warning")).toBeNull();
	});

	it("shows no warning when the restored fields are all editable", () => {
		renderHistory("admin");
		selectVersion(7); // fee_rate + app.name, neither locked
		openRollback();
		expect(screen.queryByTestId("rollback-warning")).toBeNull();
	});
});

describe("TenantHistory — rollback commit + atomic rejection", () => {
	it("commits a rollback and posts to the rollback endpoint with the note", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderHistory("admin");
		selectVersion(7);
		openRollback();
		fireEvent.change(screen.getByLabelText("Rollback version note"), {
			target: { value: "revert Q2 fee bump" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Create rollback version/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		const [path, opts] = mockClient.POST.mock.calls[0];
		expect(path).toBe("/v1/tenants/{tenantId}/versions/{version}:rollback");
		expect(opts.params.path).toEqual({ tenantId: TENANT_ID, version: 7 });
		expect(opts.params.query).toEqual({ description: "revert Q2 fee bump" });
		// Modal closes on success.
		await waitFor(() => expect(screen.queryByTestId("rollback-modal")).toBeNull());
	});

	it("surfaces an atomic re-guard rejection (FAILED_PRECONDITION) distinctly, without writing", async () => {
		mockClient.POST.mockResolvedValue({
			data: undefined,
			error: { code: 9, message: "field api.webhook_url is locked" },
		});
		renderHistory("admin");
		selectVersion(5);
		openRollback();
		fireEvent.click(screen.getByRole("button", { name: /Create rollback version/ }));
		const rejected = await screen.findByTestId("rollback-rejected");
		expect(rejected).toHaveTextContent(/Rollback rejected — nothing written/);
		expect(rejected).toHaveTextContent(/api.webhook_url is locked/);
		// Distinct from a concurrency conflict: no rebase/conflict resolver is shown.
		expect(screen.queryByTestId("conflict-resolver")).toBeNull();
		// The modal stays open showing the reason; the confirm button is gone.
		expect(screen.getByTestId("rollback-modal")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Create rollback version/ })).toBeNull();
		expect(screen.getByRole("button", { name: /Close/ })).toBeInTheDocument();
	});

	it("cancelling the modal closes it without posting", () => {
		renderHistory("admin");
		selectVersion(7);
		openRollback();
		fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
		expect(screen.queryByTestId("rollback-modal")).toBeNull();
		expect(mockClient.POST).not.toHaveBeenCalled();
	});

	it("shows a toast (not the rejected banner) for a non-rollback-rejection error", async () => {
		mockClient.POST.mockResolvedValue({
			data: undefined,
			error: { code: 13, message: "internal error" },
		});
		renderHistory("admin");
		selectVersion(7);
		openRollback();
		fireEvent.click(screen.getByRole("button", { name: /Create rollback version/ }));
		expect(await screen.findByText(/Rollback failed: internal error/)).toBeInTheDocument();
		// A generic failure is not the atomic re-guard banner.
		expect(screen.queryByTestId("rollback-rejected")).toBeNull();
	});

	it("singularises the change copy when exactly one field would change", () => {
		renderHistory("admin");
		// Rolling back to v7 re-writes exactly one field vs the current config
		// (api.webhook_url) — app.name + fee_rate already match current at v7.
		selectVersion(7);
		const modal = openRollback();
		// Copy is split across <b>1</b> + text; match the singular "field will change".
		expect(within(modal).getByText(/field will change from the current version/)).toBeTruthy();
		expect(within(modal).queryByText(/fields will change/)).toBeNull();
	});

	it("explains the superadmin lock bypass in the re-guard warning for an admin", () => {
		state.locks = { data: { locks: [{ fieldPath: "api.webhook_url" }] } };
		renderHistory("admin");
		selectVersion(5);
		openRollback();
		expect(screen.getByTestId("rollback-warning")).toHaveTextContent(
			/a superadmin can bypass locks/i,
		);
	});
});

describe("TenantHistory — diff value types + removed fields", () => {
	it("renders a removed field with an empty 'removed' new side", () => {
		renderHistory();
		selectVersion(6);
		const row = screen.getByTestId("diff-settlement.window");
		// Both the change-type tag and the empty new-side placeholder read "removed".
		expect(within(row).getAllByText("removed").length).toBeGreaterThanOrEqual(2);
		expect(within(screen.getByTestId("diff-settlement.window-old")).getByText("48h")).toBeTruthy();
		expect(
			within(screen.getByTestId("diff-settlement.window-new")).getByText("removed"),
		).toBeInTheDocument();
	});

	it("skips the no-field rollback marker entry in the diff body", () => {
		renderHistory();
		selectVersion(5);
		// v5 has a marker entry (no fieldPath) + the webhook_url change; only the
		// real field change renders.
		expect(screen.getByTestId("diff-api.webhook_url")).toBeInTheDocument();
		expect(screen.getByTestId("diff-summary")).toHaveTextContent("1 field changed");
	});
});

describe("TenantHistory — loading / error / empty states", () => {
	it("renders a skeleton while tenant or versions are loading", () => {
		state.tenant = { data: undefined as never, isLoading: true, error: null };
		const { container } = renderHistory();
		expect(screen.queryByTestId("tenant-history")).toBeNull();
		// The skeleton has no testid; assert the steady-state screen is absent + something rendered.
		expect(container.firstChild).not.toBeNull();
	});

	it("renders an error message when the tenant query fails", () => {
		state.tenant = { data: undefined as never, isLoading: false, error: new Error("boom") };
		renderHistory();
		expect(screen.getByText(/Error: boom/)).toBeInTheDocument();
	});

	it("renders nothing once loaded but the tenant is missing", () => {
		state.tenant = { data: { tenant: undefined } as never, isLoading: false, error: null };
		const { container } = renderHistory();
		expect(screen.queryByTestId("tenant-history")).toBeNull();
		expect(container.firstChild).toBeNull();
	});

	it("shows the no-versions empty state when the history is empty", () => {
		state.versions = { data: { versions: [] }, isLoading: false };
		renderHistory();
		expect(screen.getByText(/No versions yet/)).toBeInTheDocument();
		expect(screen.queryByTestId("version-timeline")).toBeNull();
	});

	it("renders the no-versions state even when the current version is unknown", () => {
		state.versions = { data: { versions: [] }, isLoading: false };
		state.config = { data: { config: { version: undefined, values: [] } } };
		renderHistory();
		expect(screen.getByText(/No versions yet/)).toBeInTheDocument();
	});
});

describe("TenantHistory — diff base + timestamps", () => {
	it("labels the earliest version's diff base as the empty/initial set", () => {
		renderHistory();
		selectVersion(1); // earliest version → base is ∅ / initial
		const pane = screen.getByTestId("diff-pane");
		expect(within(pane).getByText("∅")).toBeInTheDocument();
		expect(within(pane).getByText("initial")).toBeInTheDocument();
	});

	it("labels a mid-history version's diff base as the prior version", () => {
		renderHistory();
		selectVersion(7);
		const pane = screen.getByTestId("diff-pane");
		// base box shows v6, compare box shows v7.
		expect(within(pane).getByText("v6")).toBeInTheDocument();
		expect(within(pane).getByText("base")).toBeInTheDocument();
	});

	it("renders a formatted timestamp when the version carries createdAt", () => {
		renderHistory();
		// v8 has a createdAt; its formatted year should appear in its timeline item.
		expect(within(screen.getByTestId("version-8")).getByText(/2026/)).toBeInTheDocument();
	});

	it("pluralises the re-guard warning list when multiple fields are blocked", () => {
		// Rolling back to v3 re-writes app.name + payments.fee_rate vs current.
		// Locking both yields two re-guard conflicts → plural "fields are".
		state.locks = {
			data: { locks: [{ fieldPath: "app.name" }, { fieldPath: "payments.fee_rate" }] },
		};
		renderHistory("admin");
		selectVersion(3);
		openRollback();
		const warning = screen.getByTestId("rollback-warning");
		expect(warning).toHaveTextContent(/fields are/i);
		expect(within(warning).getByText("app.name")).toBeInTheDocument();
		expect(within(warning).getByText("payments.fee_rate")).toBeInTheDocument();
	});
});
