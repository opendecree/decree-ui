import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { components } from "../api/schema";
import { ReadView } from "../pages/ReadView";

type ConfigChange = components["schemas"]["v1ConfigChange"];

// A minimal schema/config/audit baseline; the live stream overlays on top of it.
const tenant = { name: "Acme Corp", schemaId: "s1", schemaVersion: 1 };
const schema = {
	name: "showcase",
	fields: [
		{ path: "payments.enabled", title: "Payments Enabled", type: "FIELD_TYPE_BOOL" },
		{ path: "app.name", title: "Application Name", type: "FIELD_TYPE_STRING" },
		{ path: "api.secret", title: "Secret", type: "FIELD_TYPE_JSON", sensitive: true },
	],
};
const config = {
	version: 8,
	values: [
		{ fieldPath: "payments.enabled", value: { boolValue: false }, checksum: "aaaaaaaa" },
		{ fieldPath: "app.name", value: { stringValue: "Old Name" }, checksum: "bbbbbbbb" },
		// Sensitive: server already redacted it to the literal [REDACTED].
		{ fieldPath: "api.secret", value: { jsonValue: "[REDACTED]" } },
	],
};
const audit = { entries: [] as components["schemas"]["v1AuditEntry"][] };

vi.mock("../lib/hooks", () => ({
	useTenant: () => ({ data: { tenant }, isLoading: false, error: null }),
	useSchemaVersion: () => ({ data: { schema }, isLoading: false }),
	useConfig: () => ({ data: { config }, isLoading: false }),
	useAuditLog: () => ({ data: audit }),
	useTenantNotFoundFallback: () => {},
}));

// The live stream is mocked per-test via this mutable value.
let streamReturn: { changes: ConfigChange[]; status: "connecting" | "live" | "fallback" } = {
	changes: [],
	status: "fallback",
};
vi.mock("../lib/useConfigStream", async () => {
	const actual =
		await vi.importActual<typeof import("../lib/useConfigStream")>("../lib/useConfigStream");
	return { ...actual, useConfigStream: () => streamReturn };
});

afterEach(() => {
	streamReturn = { changes: [], status: "fallback" };
});

describe("ReadView — live streaming", () => {
	it("shows the live indicator only while the stream is live", () => {
		streamReturn = { changes: [], status: "fallback" };
		const { rerender } = render(<ReadView tenantId="t1" />);
		expect(screen.queryByTestId("live-indicator")).toBeNull();
		expect(screen.getByText(/You're viewing, not editing\./)).toBeInTheDocument();

		streamReturn = { changes: [], status: "live" };
		rerender(<ReadView tenantId="t1" />);
		expect(screen.getAllByTestId("live-indicator").length).toBeGreaterThan(0);
		expect(screen.getByText(/Values stream live/)).toBeInTheDocument();
	});

	it("updates a value in place when a live change arrives", () => {
		streamReturn = {
			status: "live",
			changes: [
				{
					tenantId: "t1",
					version: 9,
					fieldPath: "payments.enabled",
					oldValue: { boolValue: false },
					newValue: { boolValue: true },
					changedBy: "carol@acme",
					changedAt: new Date().toISOString(),
				},
			],
		};
		render(<ReadView tenantId="t1" />);

		const row = screen.getByTestId("value-payments.enabled");
		// The boolean pill now reads "true" (the live value), not the polled "false".
		expect(within(row).getByText("true")).toBeInTheDocument();
		// The row is flagged live (badge + data attribute).
		expect(row).toHaveAttribute("data-live", "true");
		expect(within(row).getAllByText("live").length).toBeGreaterThan(0);
		// The change version is reflected in provenance.
		expect(within(row).getByText(/set · v9/)).toBeInTheDocument();
	});

	it("prepends the live change to the recent-changes feed", () => {
		streamReturn = {
			status: "live",
			changes: [
				{
					tenantId: "t1",
					version: 9,
					fieldPath: "app.name",
					oldValue: { stringValue: "Old Name" },
					newValue: { stringValue: "New Name" },
					changedBy: "dave@acme",
					changedAt: new Date().toISOString(),
				},
			],
		};
		render(<ReadView tenantId="t1" />);

		// Feed footer announces the live source.
		expect(screen.getByText(/streaming via/)).toBeInTheDocument();
		// The actor + new value appear in the feed.
		expect(screen.getAllByText(/dave@acme/).length).toBeGreaterThan(0);
		expect(screen.getAllByText("New Name").length).toBeGreaterThan(0);
		// The value row also reflects the streamed value.
		const row = screen.getByTestId("value-app.name");
		expect(within(row).getByText("New Name")).toBeInTheDocument();
	});

	it("keeps sensitive values redacted even when a live change targets them", () => {
		streamReturn = {
			status: "live",
			changes: [
				{
					tenantId: "t1",
					version: 9,
					fieldPath: "api.secret",
					oldValue: { jsonValue: "[REDACTED]" },
					// A server would never stream cleartext for a write-only field, but the
					// UI must never reveal regardless of what arrives.
					newValue: { jsonValue: "super-secret-token" },
					changedBy: "mallory@acme",
					changedAt: new Date().toISOString(),
				},
			],
		};
		render(<ReadView tenantId="t1" />);

		const row = screen.getByTestId("value-api.secret");
		expect(within(row).getByText("[REDACTED]")).toBeInTheDocument();
		// The streamed cleartext must not be rendered anywhere.
		expect(screen.queryByText("super-secret-token")).toBeNull();
	});

	it("reflects a live clear as an explicit-null override", () => {
		streamReturn = {
			status: "live",
			changes: [
				{
					tenantId: "t1",
					version: 9,
					fieldPath: "app.name",
					oldValue: { stringValue: "Old Name" },
					newValue: { stringValue: "" },
					changedBy: "carol@acme",
					changedAt: new Date().toISOString(),
				},
			],
		};
		render(<ReadView tenantId="t1" />);

		const row = screen.getByTestId("value-app.name");
		expect(within(row).getByText(/overrides the schema default/)).toBeInTheDocument();
		expect(within(row).getByTestId("null-badge-app.name")).toHaveTextContent("null");
	});
});
