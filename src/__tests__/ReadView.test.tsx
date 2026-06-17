import { render, screen } from "@testing-library/react";
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
});
