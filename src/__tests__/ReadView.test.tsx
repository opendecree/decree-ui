import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReadView } from "../pages/ReadView";

// Mock the data hooks so the read view renders against a fixed, showcase-like
// config. ReadView takes a tenantId prop and reads no auth/router context of its
// own, so mocking the four hooks is enough to render it in isolation.
const tenant = { name: "Acme Corp", schemaId: "s1", schemaVersion: 1 };

const schema = {
	name: "showcase",
	fields: [
		{ path: "app.name", title: "Application Name", type: "FIELD_TYPE_STRING", tags: ["general"] },
		{
			path: "app.version",
			title: "App Version",
			type: "FIELD_TYPE_STRING",
			tags: ["general"],
			readOnly: true,
		},
		{
			path: "payments.enabled",
			title: "Payments Enabled",
			type: "FIELD_TYPE_BOOL",
			tags: ["payments"],
		},
		{ path: "api.webhook_url", title: "Webhook URL", type: "FIELD_TYPE_URL", tags: ["api"] },
		{
			path: "api.rate_limits",
			title: "Rate Limits",
			type: "FIELD_TYPE_JSON",
			tags: ["api"],
			sensitive: true,
		},
		{
			path: "settlement.cutoff_time",
			title: "Cutoff Time",
			type: "FIELD_TYPE_TIME",
			tags: ["settlement"],
			nullable: true,
		},
		{
			// Deliberately cleared (explicit null) — nullable so the state is legal.
			path: "settlement.window",
			title: "Settlement Window",
			type: "FIELD_TYPE_DURATION",
			tags: ["settlement"],
			nullable: true,
		},
		{ path: "api.overrides", title: "Overrides", type: "FIELD_TYPE_JSON", tags: ["api"] },
		{
			path: "settlement.timeout",
			title: "Settlement Timeout",
			type: "FIELD_TYPE_DURATION",
			tags: ["settlement"],
		},
		{
			path: "flags.legacy_mode",
			title: "Legacy Mode",
			type: "FIELD_TYPE_STRING",
			tags: ["flags"],
			deprecated: true,
			redirectTo: "flags.tier",
		},
	],
};

const config = {
	version: 8,
	values: [
		{ fieldPath: "app.name", value: { stringValue: "OpenDecree Demo" }, checksum: "a1b2c3d4" },
		{ fieldPath: "app.version", value: { stringValue: "0.3.1" }, checksum: "d4e5f6a7" },
		{ fieldPath: "payments.enabled", value: { boolValue: true }, checksum: "6d7e8f90" },
		{
			fieldPath: "api.webhook_url",
			value: { urlValue: "https://example.com/webhooks/payments" },
			checksum: "f6071a2b",
		},
		// Sensitive: the server already redacted this to the literal [REDACTED].
		{ fieldPath: "api.rate_limits", value: { jsonValue: "[REDACTED]" } },
		{ fieldPath: "api.overrides", value: { jsonValue: '{"flag":true}' }, checksum: "0fac0fac" },
		{ fieldPath: "settlement.timeout", value: { durationValue: "86400s" }, checksum: "ddeeffaa" },
		// settlement.cutoff_time intentionally absent → unset / resolves to default.
	],
};

const audit = {
	entries: [
		{
			id: "e1",
			actor: "carol@acme",
			action: "set_field",
			fieldPath: "payments.enabled",
			oldValue: "false",
			newValue: "true",
			configVersion: 8,
			createdAt: new Date(Date.now() - 60_000).toISOString(),
		},
		{
			id: "e2",
			actor: "alice@acme",
			action: "set_field",
			fieldPath: "app.name",
			oldValue: "",
			newValue: "OpenDecree Demo",
			configVersion: 7,
			createdAt: new Date(Date.now() - 3_600_000).toISOString(),
		},
		{
			// A deliberate clear of settlement.window: had a value, new value empty →
			// explicit null (provenance distinguishes it from a never-set field).
			id: "e3",
			actor: "bob@acme",
			action: "set_field",
			fieldPath: "settlement.window",
			oldValue: "24h",
			newValue: "",
			configVersion: 7,
			createdAt: new Date(Date.now() - 7_200_000).toISOString(),
		},
		{
			// A days-old change → exercises the "Nd ago" branch of timeAgo.
			id: "e4",
			actor: "dave@acme",
			action: "set_field",
			fieldPath: "settlement.timeout",
			oldValue: "12h",
			newValue: "86400s",
			configVersion: 6,
			createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
		},
		{
			// A rollback marker entry (no field path) → exercises the feed's rollback branch.
			id: "e5",
			actor: "alice@acme",
			action: "rollback",
			newValue: "v3",
			configVersion: 5,
			createdAt: new Date(Date.now() - 30_000).toISOString(),
		},
		{
			// An actor-less, field-less, action-only entry → exercises the "?" initials
			// fallback and the bare-action branch of the feed.
			id: "e6",
			action: "export",
			createdAt: new Date(Date.now() - 10_000).toISOString(),
		},
	],
};

vi.mock("../lib/hooks", () => ({
	useTenant: () => ({ data: { tenant }, isLoading: false, error: null }),
	useSchemaVersion: () => ({ data: { schema }, isLoading: false }),
	useConfig: () => ({ data: { config }, isLoading: false }),
	useAuditLog: () => ({ data: audit }),
}));

describe("ReadView", () => {
	it("renders the read banner and the read-only marker", () => {
		render(<ReadView tenantId="t1" />);
		expect(screen.getByText(/What is set right now/)).toBeInTheDocument();
		expect(screen.getByText("Acme Corp")).toBeInTheDocument();
		expect(screen.getByText("read-only")).toBeInTheDocument();
	});

	it("renders sensitive fields as the literal [REDACTED], never masked or cleartext", () => {
		render(<ReadView tenantId="t1" />);
		expect(screen.getByText("[REDACTED]")).toBeInTheDocument();
		// No fake bullet masking, and no reveal affordance for anyone.
		expect(screen.queryByText("••••••••")).toBeNull();
		expect(screen.queryByRole("button", { name: /reveal|show value/i })).toBeNull();
	});

	it("exposes zero write affordances", () => {
		render(<ReadView tenantId="t1" />);
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("spinbutton")).toBeNull();
		expect(screen.queryByRole("combobox")).toBeNull();
		expect(screen.queryByRole("button", { name: /edit|save|lock|delete/i })).toBeNull();
	});

	it("renders values per type", () => {
		render(<ReadView tenantId="t1" />);
		// string (also appears in the changes feed, so allow multiple)
		expect(screen.getAllByText("OpenDecree Demo").length).toBeGreaterThan(0);
		// bool pill (also in the feed)
		expect(screen.getAllByText("true").length).toBeGreaterThan(0);
		// url as a link
		const link = screen.getByRole("link", { name: /example\.com\/webhooks/ });
		expect(link).toHaveAttribute("href", "https://example.com/webhooks/payments");
		// read-only badge surfaced
		expect(screen.getByText("Read-only")).toBeInTheDocument();
	});

	it("shows provenance for set fields and an unset → default state", () => {
		render(<ReadView tenantId="t1" />);
		expect(screen.getByText(/set · v8/)).toBeInTheDocument();
		expect(screen.getByText(/Not set — resolving to schema default/)).toBeInTheDocument();
		// actor appears in the recent-changes feed
		expect(screen.getAllByText(/carol@acme/).length).toBeGreaterThan(0);
	});

	it("renders JSON and duration values, and a days-ago provenance timestamp", () => {
		render(<ReadView tenantId="t1" />);
		// JSON value rendered in a <pre>.
		const overrides = screen.getByTestId("value-api.overrides");
		expect(within(overrides).getByText('{"flag":true}')).toBeInTheDocument();
		// Duration value humanised (86400s → 24h).
		const timeout = screen.getByTestId("value-settlement.timeout");
		expect(within(timeout).getByText("24h")).toBeInTheDocument();
		// 3-days-old change → "3d ago" in the provenance line.
		expect(within(timeout).getByText(/3d ago/)).toBeInTheDocument();
	});

	it("renders a rollback entry and a bare-action entry in the changes feed", () => {
		render(<ReadView tenantId="t1" />);
		// Rollback marker → "restored config to v3".
		expect(screen.getByText(/restored config to/)).toBeInTheDocument();
		expect(screen.getAllByText("v3").length).toBeGreaterThan(0);
		// Actor-less entry → "?" initials fallback + bare action label.
		expect(screen.getAllByText("export").length).toBeGreaterThan(0);
		expect(screen.getAllByText("?").length).toBeGreaterThan(0);
	});

	it("toggles the deprecated fields in and out of view", () => {
		render(<ReadView tenantId="t1" />);
		// Deprecated fields are hidden by default.
		expect(screen.queryByTestId("value-flags.legacy_mode")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /show deprecated/ }));
		expect(screen.getByTestId("value-flags.legacy_mode")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /hide deprecated/ }));
		expect(screen.queryByTestId("value-flags.legacy_mode")).toBeNull();
	});

	it("distinguishes explicit-null from unset by provenance", () => {
		render(<ReadView tenantId="t1" />);

		// settlement.window was deliberately cleared → explicit null (a stored value).
		const cleared = screen.getByTestId("value-settlement.window");
		expect(within(cleared).getByTestId("null-badge-settlement.window")).toHaveTextContent("null");
		expect(within(cleared).getByText(/overrides the schema default/)).toBeInTheDocument();
		// Right rail reads it as a deliberate clear, with the clearing actor.
		expect(within(cleared).getByText(/set · null · v7/)).toBeInTheDocument();
		expect(within(cleared).getByText(/cleared by bob@acme/)).toBeInTheDocument();

		// settlement.cutoff_time was never set → unset (default applies), no null badge.
		const unset = screen.getByTestId("value-settlement.cutoff_time");
		expect(within(unset).queryByTestId("null-badge-settlement.cutoff_time")).toBeNull();
		expect(within(unset).getByText(/Not set — resolving to schema default/)).toBeInTheDocument();
		expect(within(unset).getByText(/provenance: default/)).toBeInTheDocument();
	});
});
