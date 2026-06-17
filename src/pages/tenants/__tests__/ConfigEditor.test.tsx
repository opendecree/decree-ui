import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "../../../api/schema";
import { AuthContext, type AuthContextValue } from "../../../lib/auth";
import type { Role } from "../../../lib/constants";
import { ToastProvider } from "../../../lib/toast";
import { ConfigEditor } from "../ConfigEditor";

type SchemaField = components["schemas"]["v1SchemaField"];

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

// --- Mutable mocks the tests configure per-case ---------------------------------

const tenant = { id: TENANT_ID, name: "Acme Corp", schemaId: "s1", schemaVersion: 1 };

// A schema exercising every constraint kind + every guard.
const fields: SchemaField[] = [
	{
		path: "app.name",
		title: "Application Name",
		type: "FIELD_TYPE_STRING",
		tags: ["general"],
		constraints: { minLength: 1, maxLength: 100 },
	},
	{
		path: "app.version",
		title: "App Version",
		type: "FIELD_TYPE_STRING",
		tags: ["general"],
		readOnly: true,
	},
	{
		path: "payments.retries",
		title: "Retries",
		type: "FIELD_TYPE_INT",
		tags: ["payments"],
		constraints: { min: 0, max: 10 },
	},
	{
		path: "payments.fee_rate",
		title: "Fee Rate",
		type: "FIELD_TYPE_NUMBER",
		tags: ["payments"],
		constraints: { min: 0, max: 100 },
	},
	{
		path: "payments.currency",
		title: "Currency",
		type: "FIELD_TYPE_STRING",
		tags: ["payments"],
		writeOnce: true,
		constraints: { enumValues: ["USD", "EUR", "GBP"] },
	},
	{
		path: "settlement.window",
		title: "Window",
		type: "FIELD_TYPE_DURATION",
		tags: ["settlement"],
		constraints: { min: 3600, max: 2592000 },
	},
	{ path: "api.webhook_url", title: "Webhook URL", type: "FIELD_TYPE_URL", tags: ["api"] },
	{
		path: "api.rate_limits",
		title: "Rate Limits",
		type: "FIELD_TYPE_JSON",
		tags: ["api"],
		sensitive: true,
	},
	{ path: "flags.enabled", title: "Enabled", type: "FIELD_TYPE_BOOL", tags: ["flags"] },
	{
		path: "flags.tier",
		title: "Tier",
		type: "FIELD_TYPE_STRING",
		tags: ["flags"],
		constraints: { enumValues: ["bronze", "silver", "gold"] },
	},
	{ path: "flags.cutover", title: "Cutover", type: "FIELD_TYPE_TIME", tags: ["flags"] },
	{ path: "flags.overrides", title: "Overrides", type: "FIELD_TYPE_JSON", tags: ["flags"] },
	{
		path: "flags.note",
		title: "Note",
		type: "FIELD_TYPE_STRING",
		tags: ["flags"],
		nullable: true,
	},
	{
		path: "flags.legacy_mode",
		title: "Legacy Mode",
		type: "FIELD_TYPE_STRING",
		tags: ["flags"],
		deprecated: true,
		redirectTo: "flags.tier",
		defaultValue: "off",
	},
];

const configValues = [
	{ fieldPath: "app.name", value: { stringValue: "OpenDecree Demo" }, checksum: "a1b2c3d4" },
	{ fieldPath: "app.version", value: { stringValue: "0.3.1" }, checksum: "d4e5f6a7" },
	{ fieldPath: "payments.retries", value: { integerValue: "3" }, checksum: "07182930" },
	{ fieldPath: "payments.fee_rate", value: { numberValue: 1.0 }, checksum: "3a4b5c6d" },
	{ fieldPath: "payments.currency", value: { stringValue: "USD" }, checksum: "90a1b2c3" },
	{ fieldPath: "settlement.window", value: { durationValue: "24h" }, checksum: "c3d4e5f6" },
	{
		fieldPath: "api.webhook_url",
		value: { urlValue: "https://example.com/webhooks/payments" },
		checksum: "f6071a2b",
	},
	{ fieldPath: "api.rate_limits", value: { jsonValue: "[REDACTED]" }, checksum: "b2c3d4e5" },
	{ fieldPath: "flags.enabled", value: { boolValue: false }, checksum: "11223344" },
	{ fieldPath: "flags.tier", value: { stringValue: "bronze" }, checksum: "55667788" },
	{
		fieldPath: "flags.cutover",
		value: { timeValue: "2025-01-15T09:30:00Z" },
		checksum: "99aabbcc",
	},
	{ fieldPath: "flags.overrides", value: { jsonValue: '{"a":1}' }, checksum: "ddeeff00" },
];

let mockLocks: { fieldPath: string }[] = [];
const mockConfigVersion = 7;
const mockClient = {
	POST: vi.fn(),
	GET: vi.fn(),
};

vi.mock("../../../lib/hooks", () => ({
	useApiClient: () => mockClient,
	useTenant: () => ({ data: { tenant }, isLoading: false, error: null }),
	useSchemaVersion: () => ({ data: { schema: { name: "showcase", fields } }, isLoading: false }),
	useConfig: () => ({
		data: { config: { version: mockConfigVersion, values: configValues } },
		isLoading: false,
	}),
	useFieldLocks: () => ({ data: { locks: mockLocks } }),
}));

/** Build a fresh-config GET response with fee_rate diverged + a new checksum. */
function divergedConfig() {
	return {
		data: {
			config: {
				version: 8,
				values: configValues.map((v) =>
					v.fieldPath === "payments.fee_rate"
						? { ...v, value: { numberValue: 3.0 }, checksum: "c9d0e1f2" }
						: v,
				),
			},
		},
		error: undefined,
	};
}

beforeEach(() => {
	mockLocks = [];
	mockClient.POST.mockReset();
	mockClient.GET.mockReset();
	mockClient.GET.mockResolvedValue({
		data: { config: { version: 8, values: configValues } },
		error: undefined,
	});
});

/** Render the editor with a controllable role. */
function renderEditor(role: Role = "admin") {
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
					<ConfigEditor tenantId={TENANT_ID} />
				</Harness>
			</ToastProvider>
		</QueryClientProvider>,
	);
}

function changeField(testid: string, label: string | RegExp, value: string) {
	const input = within(screen.getByTestId(testid)).getByLabelText(label);
	fireEvent.change(input, { target: { value } });
	return input;
}

describe("ConfigEditor — tokenized render", () => {
	it("renders the tenant + schema header and a row per field", () => {
		renderEditor();
		expect(screen.getByText("Acme Corp")).toBeInTheDocument();
		expect(screen.getByText(/showcase v1 · config v7/)).toBeInTheDocument();
		expect(screen.getByTestId("field-app.name")).toBeInTheDocument();
		expect(screen.getByTestId("field-payments.fee_rate")).toBeInTheDocument();
	});

	it("shows the per-field constraint hint near the input", () => {
		renderEditor();
		const row = screen.getByTestId("field-payments.retries");
		expect(within(row).getByText(/int · min 0 · max 10/)).toBeInTheDocument();
	});
});

describe("ConfigEditor — live validation per type", () => {
	it("flags an int above max with aria-invalid + inline error and blocks Save", () => {
		renderEditor();
		const input = changeField("field-payments.retries", "Retries", "50");
		expect(input).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByRole("alert")).toHaveTextContent(/Above maximum/);
		expect(screen.getByRole("button", { name: /Save batch/ })).toBeDisabled();
		expect(screen.getByTestId("save-blocked-hint")).toBeInTheDocument();
	});

	it("flags a too-long string (maxLength)", () => {
		renderEditor();
		const input = changeField("field-app.name", "Application Name", "x".repeat(101));
		expect(input).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByRole("alert")).toHaveTextContent(/Too long/);
	});

	it("flags an invalid Go duration", () => {
		renderEditor();
		changeField("field-settlement.window", "Window", "nope");
		expect(screen.getByRole("alert")).toHaveTextContent(/Invalid Go duration/);
	});

	it("flags an invalid URL", () => {
		renderEditor();
		changeField("field-api.webhook_url", "Webhook URL", "not a url");
		expect(screen.getByRole("alert")).toHaveTextContent(/Not a valid URL/);
	});

	it("flags invalid JSON on the sensitive write-only input", () => {
		renderEditor();
		changeField("field-api.rate_limits", /Overwrite Rate Limits/, "{ broken");
		expect(screen.getByRole("alert")).toHaveTextContent(/Must be valid JSON/);
	});

	it("links the error to the input via aria-describedby", () => {
		renderEditor();
		const input = changeField("field-payments.retries", "Retries", "50");
		const describedBy = input.getAttribute("aria-describedby") ?? "";
		const alert = screen.getByRole("alert");
		expect(describedBy.split(" ")).toContain(alert.id);
	});

	it("clears the error and re-enables Save once the value is valid", () => {
		renderEditor();
		const input = changeField("field-payments.retries", "Retries", "50");
		expect(screen.getByRole("button", { name: /Save batch/ })).toBeDisabled();
		fireEvent.change(input, { target: { value: "5" } });
		expect(input).toHaveAttribute("aria-invalid", "false");
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByRole("button", { name: /Save batch/ })).toBeEnabled();
	});
});

describe("ConfigEditor — fieldEditBlock gating", () => {
	it("disables a read-only field for superadmin and labels it read-only", () => {
		renderEditor("superadmin");
		const row = screen.getByTestId("field-app.version");
		expect(within(row).queryByLabelText("App Version")).toBeNull();
		expect(within(row).getByTestId("disabled-value")).toHaveTextContent("read-only");
	});

	it("disables a write-once field that already has a value (even for superadmin)", () => {
		renderEditor("superadmin");
		const row = screen.getByTestId("field-payments.currency");
		expect(within(row).queryByLabelText("Currency")).toBeNull();
		expect(within(row).getByTestId("disabled-value")).toHaveTextContent("write-once");
	});

	it("blocks a locked field for admin and labels it locked", () => {
		mockLocks = [{ fieldPath: "api.webhook_url" }];
		renderEditor("admin");
		const row = screen.getByTestId("field-api.webhook_url");
		expect(within(row).queryByLabelText("Webhook URL")).toBeNull();
		expect(within(row).getByTestId("disabled-value")).toHaveTextContent("locked");
	});

	it("superadmin bypasses a lock — the input is editable", () => {
		mockLocks = [{ fieldPath: "api.webhook_url" }];
		renderEditor("superadmin");
		const row = screen.getByTestId("field-api.webhook_url");
		expect(within(row).getByLabelText("Webhook URL")).toBeInTheDocument();
		expect(within(row).queryByTestId("disabled-value")).toBeNull();
	});
});

describe("ConfigEditor — sensitive write-only", () => {
	it("shows [REDACTED] for the current value and a write-only overwrite input", () => {
		renderEditor();
		const row = screen.getByTestId("field-api.rate_limits");
		expect(within(row).getByText("[REDACTED]")).toBeInTheDocument();
		expect(within(row).getByLabelText(/Overwrite Rate Limits \(write-only\)/)).toBeInTheDocument();
		// No reveal affordance, no bullet masking.
		expect(within(row).queryByText("••••••••")).toBeNull();
		expect(within(row).queryByRole("button", { name: /reveal|show/i })).toBeNull();
	});
});

describe("ConfigEditor — save + optimistic concurrency", () => {
	it("a clean save POSTs the batch with each field's expectedChecksum", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		changeField("field-app.name", "Application Name", "Renamed");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		const body = mockClient.POST.mock.calls[0][1].body;
		expect(body.updates).toEqual([
			{ fieldPath: "app.name", value: { stringValue: "Renamed" }, expectedChecksum: "a1b2c3d4" },
		]);
	});

	it("an ABORTED rejection opens the rebase resolver showing mine vs theirs", async () => {
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch" },
		});
		mockClient.GET.mockResolvedValue(divergedConfig());
		renderEditor();
		changeField("field-payments.fee_rate", "Fee Rate", "2.5");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));

		const dialog = await screen.findByTestId("conflict-resolver");
		expect(within(dialog).getByText(/rejected whole/)).toBeInTheDocument();
		const conflictRow = within(dialog).getByTestId("conflict-payments.fee_rate");
		expect(within(conflictRow).getByText("2.5")).toBeInTheDocument(); // mine
		expect(within(conflictRow).getByText("3")).toBeInTheDocument(); // theirs
	});

	it("rebasing re-applies 'keep mine' against the fresh checksum and re-POSTs", async () => {
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch" },
		});
		mockClient.GET.mockResolvedValue(divergedConfig());
		mockClient.POST.mockResolvedValueOnce({ data: {}, error: undefined });

		renderEditor();
		changeField("field-payments.fee_rate", "Fee Rate", "2.5");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));

		const dialog = await screen.findByTestId("conflict-resolver");
		fireEvent.click(within(dialog).getByRole("button", { name: /Rebase & save/ }));

		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(2));
		const rebaseBody = mockClient.POST.mock.calls[1][1].body;
		expect(rebaseBody.updates).toEqual([
			{
				fieldPath: "payments.fee_rate",
				value: { numberValue: 2.5 },
				expectedChecksum: "c9d0e1f2", // the FRESH checksum, not the stale one
			},
		]);
		await waitFor(() => expect(screen.queryByTestId("conflict-resolver")).toBeNull());
	});

	it("'take theirs' drops the field from the rebase write", async () => {
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch" },
		});
		mockClient.GET.mockResolvedValue(divergedConfig());

		renderEditor();
		changeField("field-payments.fee_rate", "Fee Rate", "2.5");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));

		const dialog = await screen.findByTestId("conflict-resolver");
		const conflictRow = within(dialog).getByTestId("conflict-payments.fee_rate");
		fireEvent.click(within(conflictRow).getByRole("button", { name: /Take theirs/ }));
		fireEvent.click(within(dialog).getByRole("button", { name: /Rebase & save/ }));

		await waitFor(() => expect(screen.queryByTestId("conflict-resolver")).toBeNull());
		// Only the initial save POST fired; the rebase had nothing to write.
		expect(mockClient.POST).toHaveBeenCalledTimes(1);
	});
});

describe("ConfigEditor — typed inputs & TypedValue encoding", () => {
	it("renders a bool toggle and encodes boolValue on save", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		const toggle = within(screen.getByTestId("field-flags.enabled")).getByLabelText("Enabled");
		expect(toggle).toHaveAttribute("type", "checkbox");
		fireEvent.click(toggle); // false -> true
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][1].body.updates).toEqual([
			{ fieldPath: "flags.enabled", value: { boolValue: true }, expectedChecksum: "11223344" },
		]);
	});

	it("renders an enum select and encodes stringValue on save", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		const select = within(screen.getByTestId("field-flags.tier")).getByLabelText("Tier");
		expect(select.tagName).toBe("SELECT");
		fireEvent.change(select, { target: { value: "gold" } });
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][1].body.updates).toEqual([
			{ fieldPath: "flags.tier", value: { stringValue: "gold" }, expectedChecksum: "55667788" },
		]);
	});

	it("renders a JSON textarea and encodes jsonValue on save", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		const ta = within(screen.getByTestId("field-flags.overrides")).getByLabelText("Overrides");
		expect(ta.tagName).toBe("TEXTAREA");
		fireEvent.change(ta, { target: { value: '{"b":2}' } });
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][1].body.updates).toEqual([
			{
				fieldPath: "flags.overrides",
				value: { jsonValue: '{"b":2}' },
				expectedChecksum: "ddeeff00",
			},
		]);
	});

	it("encodes timeValue on save for a time field", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		changeField("field-flags.cutover", "Cutover", "2025-06-01T00:00:00Z");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][1].body.updates).toEqual([
			{
				fieldPath: "flags.cutover",
				value: { timeValue: "2025-06-01T00:00:00Z" },
				expectedChecksum: "99aabbcc",
			},
		]);
	});

	it("encodes durationValue on save for a duration field", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		changeField("field-settlement.window", "Window", "12h");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][1].body.updates).toEqual([
			{
				fieldPath: "settlement.window",
				value: { durationValue: "12h" },
				expectedChecksum: "c3d4e5f6",
			},
		]);
	});

	it("encodes urlValue on save for a url field", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		changeField("field-api.webhook_url", "Webhook URL", "https://new.example.com/hook");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][1].body.updates).toEqual([
			{
				fieldPath: "api.webhook_url",
				value: { urlValue: "https://new.example.com/hook" },
				expectedChecksum: "f6071a2b",
			},
		]);
	});

	it("encodes integerValue on save for an int field", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		changeField("field-payments.retries", "Retries", "7");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][1].body.updates).toEqual([
			{ fieldPath: "payments.retries", value: { integerValue: "7" }, expectedChecksum: "07182930" },
		]);
	});

	it("uses a 'not set' placeholder for an unset nullable field", () => {
		renderEditor();
		const input = within(screen.getByTestId("field-flags.note")).getByLabelText("Note");
		expect(input).toHaveAttribute("placeholder", expect.stringMatching(/Not set/));
	});

	it("renders deprecated badge, redirect hint, and default for a deprecated field", () => {
		renderEditor();
		const row = screen.getByTestId("field-flags.legacy_mode");
		expect(within(row).getByText("deprecated")).toBeInTheDocument();
		expect(within(row).getByText(/Use/)).toBeInTheDocument();
		expect(within(row).getByText("flags.tier")).toBeInTheDocument();
		expect(within(row).getByText("off")).toBeInTheDocument();
	});

	it("toggling a value back to the server value un-stages it (no save bar)", () => {
		renderEditor();
		const toggle = within(screen.getByTestId("field-flags.enabled")).getByLabelText("Enabled");
		fireEvent.click(toggle); // false -> true (staged)
		expect(screen.getByRole("button", { name: /Save batch/ })).toBeInTheDocument();
		fireEvent.click(toggle); // true -> false, back to server value (un-staged)
		expect(screen.queryByRole("button", { name: /Save batch/ })).toBeNull();
	});
});

describe("ConfigEditor — loading & error states", () => {
	it("renders a loading placeholder while any query is loading", async () => {
		const hooks = await import("../../../lib/hooks");
		const spy = vi.spyOn(hooks, "useConfig").mockReturnValue({
			data: undefined,
			isLoading: true,
		} as ReturnType<typeof hooks.useConfig>);
		renderEditor();
		expect(screen.getByText("Loading config…")).toBeInTheDocument();
		spy.mockRestore();
	});

	it("renders the tenant error message when the tenant query fails", async () => {
		const hooks = await import("../../../lib/hooks");
		const spy = vi.spyOn(hooks, "useTenant").mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error("tenant gone"),
		} as ReturnType<typeof hooks.useTenant>);
		renderEditor();
		expect(screen.getByText(/Error: tenant gone/)).toBeInTheDocument();
		spy.mockRestore();
	});

	it("renders nothing when the tenant is absent (no error, not loading)", async () => {
		const hooks = await import("../../../lib/hooks");
		const spy = vi.spyOn(hooks, "useTenant").mockReturnValue({
			data: { tenant: undefined },
			isLoading: false,
			error: null,
		} as ReturnType<typeof hooks.useTenant>);
		const { container } = renderEditor();
		expect(container.querySelector('[data-testid="config-editor"]')).toBeNull();
		spy.mockRestore();
	});
});

describe("ConfigEditor — save guards & staging controls", () => {
	it("keeps Save disabled while any staged field is invalid (blocked path)", () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderEditor();
		changeField("field-payments.retries", "Retries", "999");
		const save = screen.getByRole("button", { name: /Save batch/ });
		expect(save).toBeDisabled();
		// Clicking a disabled button is a no-op — the mutation never fires.
		fireEvent.click(save);
		expect(mockClient.POST).not.toHaveBeenCalled();
	});

	it("Discard clears every staged change and hides the save bar", () => {
		renderEditor();
		changeField("field-app.name", "Application Name", "Renamed");
		expect(screen.getByRole("button", { name: /Save batch/ })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Discard" }));
		expect(screen.queryByRole("button", { name: /Save batch/ })).toBeNull();
	});

	it("'changed only' filters the rows down to staged fields", () => {
		renderEditor();
		changeField("field-app.name", "Application Name", "Renamed");
		fireEvent.click(screen.getByRole("button", { name: /changed only/ }));
		expect(screen.getByTestId("field-app.name")).toBeInTheDocument();
		expect(screen.queryByTestId("field-payments.retries")).toBeNull();
	});
});

describe("ConfigEditor — non-ABORTED save error", () => {
	it("surfaces a generic error toast and does not open the resolver", async () => {
		mockClient.POST.mockResolvedValue({
			data: undefined,
			error: { code: 7, message: "permission denied" },
		});
		renderEditor();
		changeField("field-app.name", "Application Name", "Renamed");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));
		expect(await screen.findByText("permission denied")).toBeInTheDocument();
		expect(screen.queryByTestId("conflict-resolver")).toBeNull();
	});
});

describe("ConfigEditor — import / export", () => {
	it("export fetches the config and triggers a download", async () => {
		mockClient.GET.mockResolvedValue({
			data: { yamlContent: "app:\n  name: Demo\n" },
			error: undefined,
		});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		renderEditor();
		fireEvent.click(screen.getByRole("button", { name: /Export/ }));
		await waitFor(() => expect(clickSpy).toHaveBeenCalled());
		clickSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it("export decodes a base64 (format: byte) payload before download", async () => {
		const yaml = "app:\n  name: Demo\n";
		const b64 = btoa(yaml); // valid base64, length % 4 === 0
		mockClient.GET.mockResolvedValue({ data: { yamlContent: b64 }, error: undefined });
		const blobSpy = vi.fn();
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		const OriginalBlob = globalThis.Blob;
		vi.stubGlobal(
			"Blob",
			class extends OriginalBlob {
				constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
					blobSpy(parts, opts);
					super(parts, opts);
				}
			},
		);
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		renderEditor();
		fireEvent.click(screen.getByRole("button", { name: /Export/ }));
		await waitFor(() => expect(clickSpy).toHaveBeenCalled());
		// The blob was built from the DECODED yaml, not the raw base64.
		expect(blobSpy).toHaveBeenCalledWith([yaml], { type: "application/yaml" });
		clickSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it("shows an error toast when export fails", async () => {
		mockClient.GET.mockResolvedValue({
			data: undefined,
			error: { message: "export boom" },
		});
		renderEditor();
		fireEvent.click(screen.getByRole("button", { name: /Export/ }));
		expect(await screen.findByText(/Export failed: export boom/)).toBeInTheDocument();
	});

	it("import reads a YAML file and POSTs its base64 contents, then toasts success", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		const { container } = renderEditor();
		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["app:\n  name: Imported\n"], "config.yaml", {
			type: "application/yaml",
		});
		fireEvent.change(fileInput, { target: { files: [file] } });

		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		const [path, opts] = mockClient.POST.mock.calls[0];
		expect(path).toBe("/v1/tenants/{tenantId}/config/import");
		expect(opts.body.mode).toBe("IMPORT_MODE_MERGE");
		expect(opts.body.yamlContent).toBe(
			btoa(unescape(encodeURIComponent("app:\n  name: Imported\n"))),
		);
		expect(await screen.findByText("Imported config")).toBeInTheDocument();
		// The input is cleared so the same file can be re-imported.
		expect(fileInput.value).toBe("");
	});

	it("does nothing when the file picker is dismissed with no file", () => {
		const { container } = renderEditor();
		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		fireEvent.change(fileInput, { target: { files: [] } });
		expect(mockClient.POST).not.toHaveBeenCalled();
	});

	it("shows an error toast when import fails", async () => {
		mockClient.POST.mockResolvedValue({
			data: undefined,
			error: { message: "bad yaml" },
		});
		const { container } = renderEditor();
		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["broken"], "config.yaml", { type: "application/yaml" });
		fireEvent.change(fileInput, { target: { files: [file] } });
		expect(await screen.findByText(/Import failed: bad yaml/)).toBeInTheDocument();
	});
});

describe("ConfigEditor — rebase failure paths", () => {
	it("toasts a 'still conflicting' message when the rebase write is ABORTED again", async () => {
		// Initial save: ABORTED → opens resolver.
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch" },
		});
		mockClient.GET.mockResolvedValue(divergedConfig());
		// Rebase write: ABORTED again.
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch again" },
		});

		renderEditor();
		changeField("field-payments.fee_rate", "Fee Rate", "2.5");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));

		const dialog = await screen.findByTestId("conflict-resolver");
		fireEvent.click(within(dialog).getByRole("button", { name: /Rebase & save/ }));

		expect(await screen.findByText(/Still conflicting/)).toBeInTheDocument();
	});

	it("toasts a generic error when the rebase write fails for a non-ABORTED reason", async () => {
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch" },
		});
		mockClient.GET.mockResolvedValue(divergedConfig());
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { message: "server exploded" },
		});

		renderEditor();
		changeField("field-payments.fee_rate", "Fee Rate", "2.5");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));

		const dialog = await screen.findByTestId("conflict-resolver");
		fireEvent.click(within(dialog).getByRole("button", { name: /Rebase & save/ }));

		expect(await screen.findByText("server exploded")).toBeInTheDocument();
	});

	it("rebases all staged fields when ABORTED but no committed value visibly moved", async () => {
		// Save is rejected ABORTED, but the re-fetched config is byte-identical
		// (the default GET mock returns the unchanged values) — the resolver still
		// opens and lists the staged field so it can be rebased onto fresh checksums.
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch" },
		});
		// beforeEach already points GET at the unchanged config (version 8).
		renderEditor();
		changeField("field-app.name", "Application Name", "Renamed");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));

		const dialog = await screen.findByTestId("conflict-resolver");
		const row = within(dialog).getByTestId("conflict-app.name");
		expect(within(row).getByText("Renamed")).toBeInTheDocument(); // mine
	});

	it("closes the resolver on Cancel without writing", async () => {
		mockClient.POST.mockResolvedValueOnce({
			data: undefined,
			error: { code: 10, message: "checksum mismatch" },
		});
		mockClient.GET.mockResolvedValue(divergedConfig());
		renderEditor();
		changeField("field-payments.fee_rate", "Fee Rate", "2.5");
		fireEvent.click(screen.getByRole("button", { name: /Save batch/ }));

		const dialog = await screen.findByTestId("conflict-resolver");
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByTestId("conflict-resolver")).toBeNull());
		// Only the initial save fired.
		expect(mockClient.POST).toHaveBeenCalledTimes(1);
	});
});
