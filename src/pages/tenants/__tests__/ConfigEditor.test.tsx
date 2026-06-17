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
});
