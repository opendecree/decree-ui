import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "../../../api/schema";
import { AuthContext, type AuthContextValue } from "../../../lib/auth";
import type { Role } from "../../../lib/constants";
import { ToastProvider } from "../../../lib/toast";
import { SchemaAuthor } from "../SchemaAuthor";

type SchemaField = components["schemas"]["v1SchemaField"];
type Schema = components["schemas"]["v1Schema"];

const SCHEMA_ID = "11111111-1111-1111-1111-111111111111";

// A draft schema exercising every field type + every flag.
const draftFields: SchemaField[] = [
	{
		path: "app.name",
		title: "Application Name",
		type: "FIELD_TYPE_STRING",
		tags: ["general"],
		description: "Display name.",
		constraints: { minLength: 1, maxLength: 100 },
		defaultValue: "MyApp",
	},
	{
		path: "app.version",
		title: "App Version",
		type: "FIELD_TYPE_STRING",
		tags: ["general"],
		readOnly: true,
		constraints: { regex: "^\\d+\\.\\d+$" },
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
	{ path: "payments.enabled", title: "Enabled", type: "FIELD_TYPE_BOOL", tags: ["payments"] },
	{
		path: "payments.currency",
		title: "Currency",
		type: "FIELD_TYPE_STRING",
		tags: ["payments"],
		writeOnce: true,
		constraints: { enumValues: ["USD", "EUR"] },
	},
	{
		path: "settlement.window",
		title: "Window",
		type: "FIELD_TYPE_DURATION",
		tags: ["settlement"],
		constraints: { min: 3600 },
	},
	{ path: "settlement.cutoff", title: "Cutoff", type: "FIELD_TYPE_TIME", tags: ["settlement"] },
	{ path: "api.webhook_url", title: "Webhook URL", type: "FIELD_TYPE_URL", tags: ["api"] },
	{
		path: "api.rate_limits",
		title: "Rate Limits",
		type: "FIELD_TYPE_JSON",
		tags: ["api"],
		sensitive: true,
		constraints: { jsonSchema: '{"type":"object"}' },
	},
	{
		path: "legacy.old_fee",
		title: "Old Fee",
		type: "FIELD_TYPE_NUMBER",
		tags: ["legacy"],
		deprecated: true,
		redirectTo: "payments.fee_rate",
	},
];

const draftSchema: Schema = {
	id: SCHEMA_ID,
	name: "showcase",
	version: 2,
	parentVersion: 1,
	published: false,
	fields: draftFields,
};

const publishedSchema: Schema = {
	...draftSchema,
	version: 1,
	parentVersion: undefined,
	published: true,
};

// --- Mutable mocks --------------------------------------------------------------

let mockSchema: Schema | undefined = draftSchema;
let mockLoading = false;
let mockError: Error | null = null;
const mockClient = { PATCH: vi.fn(), POST: vi.fn(), GET: vi.fn() };

vi.mock("../../../lib/hooks", () => ({
	useApiClient: () => mockClient,
	useSchema: () => ({ data: { schema: mockSchema }, isLoading: mockLoading, error: mockError }),
}));

beforeEach(() => {
	mockSchema = draftSchema;
	mockLoading = false;
	mockError = null;
	mockClient.PATCH.mockReset();
	mockClient.POST.mockReset();
	mockClient.GET.mockReset();
});

function renderAuthor(role: Role = "superadmin") {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	function Harness({ children }: { children: ReactNode }) {
		const [auth] = useState({ subject: "root", role, tenantId: "" });
		const ctx: AuthContextValue = { auth, setAuth: () => {} };
		return <AuthContext value={ctx}>{children}</AuthContext>;
	}
	return render(
		<QueryClientProvider client={qc}>
			<ToastProvider>
				<Harness>
					<MemoryRouter initialEntries={[`/schemas/${SCHEMA_ID}/author`]}>
						<Routes>
							<Route path="/schemas/:id/author" element={<SchemaAuthor />} />
							<Route path="/schemas" element={<div>schemas list</div>} />
						</Routes>
					</MemoryRouter>
				</Harness>
			</ToastProvider>
		</QueryClientProvider>,
	);
}

/** Select a field in the left list by path. */
function selectField(path: string) {
	fireEvent.click(screen.getByTestId(`field-item-${path}`));
}

describe("SchemaAuthor — permission gate", () => {
	it("renders the workbench for superadmin", () => {
		renderAuthor("superadmin");
		expect(screen.getByTestId("schema-author-page")).toBeInTheDocument();
	});

	it("refuses admin with a clear message, not a disabled editor", () => {
		renderAuthor("admin");
		expect(screen.getByTestId("schema-author-denied")).toBeInTheDocument();
		expect(screen.queryByTestId("schema-author-page")).toBeNull();
	});

	it("refuses user", () => {
		renderAuthor("user");
		expect(screen.getByTestId("schema-author-denied")).toBeInTheDocument();
	});
});

describe("SchemaAuthor — loading & error", () => {
	it("shows a skeleton while loading", () => {
		mockLoading = true;
		const { container } = renderAuthor();
		expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
	});

	it("shows an error message when the query fails", () => {
		mockError = new Error("schema gone");
		renderAuthor();
		expect(screen.getByTestId("schema-author-error")).toHaveTextContent("schema gone");
	});

	it("renders nothing when the schema is absent", () => {
		mockSchema = undefined;
		const { container } = renderAuthor();
		expect(container.querySelector('[data-testid="schema-author-page"]')).toBeNull();
	});
});

describe("SchemaAuthor — field list", () => {
	it("renders the field count and a grouped list", () => {
		renderAuthor();
		expect(screen.getByTestId("field-count")).toHaveTextContent("11 · 8 types");
		expect(screen.getByTestId("field-item-app.name")).toBeInTheDocument();
		expect(screen.getByTestId("field-item-api.rate_limits")).toBeInTheDocument();
		expect(screen.getByTestId("field-item-rules")).toBeInTheDocument();
	});

	it("shows the empty editor until a field is selected", () => {
		renderAuthor();
		expect(screen.getByTestId("editor-empty")).toBeInTheDocument();
	});
});

describe("SchemaAuthor — lifecycle bar", () => {
	it("shows the draft state and editable affordance for a draft", () => {
		renderAuthor();
		expect(screen.getByTestId("lifecycle-state")).toHaveTextContent("v2 · draft");
		expect(screen.getByText("forked from v1")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Publish v2/ })).toBeInTheDocument();
	});

	it("shows the published immutable state and a New draft fork action", () => {
		mockSchema = publishedSchema;
		renderAuthor();
		expect(screen.getByTestId("lifecycle-state")).toHaveTextContent("v1 · published");
		expect(screen.getByTestId("immutable-banner")).toBeInTheDocument();
		expect(screen.getByTestId("fork-btn")).toBeInTheDocument();
		// No publish/save on a published version.
		expect(screen.queryByRole("button", { name: /Publish v/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /Save draft/ })).toBeNull();
	});
});

describe("SchemaAuthor — type-adaptive constraint editor", () => {
	it("shows min/max + exclusive toggles for an int", () => {
		renderAuthor();
		selectField("payments.retries");
		const editor = screen.getByTestId("field-editor");
		expect(within(editor).getByLabelText("Minimum")).toHaveValue(0);
		expect(within(editor).getByLabelText("Maximum")).toHaveValue(10);
		expect(within(editor).getAllByLabelText("exclusive")).toHaveLength(2);
	});

	it("shows length + pattern + enum for a string", () => {
		renderAuthor();
		selectField("app.name");
		const editor = screen.getByTestId("field-editor");
		expect(within(editor).getByLabelText("Minimum length")).toHaveValue(1);
		expect(within(editor).getByLabelText("Pattern")).toBeInTheDocument();
		expect(within(editor).getByTestId("enum-chips")).toBeInTheDocument();
	});

	it("shows a JSON Schema textarea for a json field", () => {
		renderAuthor();
		selectField("api.rate_limits");
		expect(screen.getByLabelText("JSON Schema")).toHaveValue('{"type":"object"}');
	});

	it("shows a URL allow-list chip set for a url field", () => {
		renderAuthor();
		selectField("api.webhook_url");
		expect(screen.getByTestId("url-enum-chips")).toBeInTheDocument();
	});

	it("shows the duration second-bounds editor", () => {
		renderAuthor();
		selectField("settlement.window");
		expect(screen.getByLabelText("Minimum")).toHaveValue(3600);
	});

	it("shows 'no constraints' for bool and time", () => {
		renderAuthor();
		selectField("payments.enabled");
		expect(screen.getByTestId("no-constraints")).toHaveTextContent(/Booleans take no constraints/);
		selectField("settlement.cutoff");
		expect(screen.getByTestId("no-constraints")).toHaveTextContent(/RFC 3339/);
	});

	it("adapts the constraint section when the type changes", () => {
		renderAuthor();
		selectField("app.name"); // string → has Pattern
		expect(screen.getByLabelText("Pattern")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("type-FIELD_TYPE_INT"));
		// Now numeric → Pattern is gone, Minimum appears.
		expect(screen.queryByLabelText("Pattern")).toBeNull();
		expect(screen.getByLabelText("Minimum")).toBeInTheDocument();
	});
});

describe("SchemaAuthor — metadata + flags editing", () => {
	it("edits the title and marks the draft dirty with a diff summary", () => {
		renderAuthor();
		selectField("app.name");
		fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
		expect(screen.getByTestId("dirty-note")).toBeInTheDocument();
		expect(screen.getByTestId("diff-summary")).toHaveTextContent("~1 changed");
	});

	it("edits tags from a comma-separated input", () => {
		renderAuthor();
		selectField("app.name");
		const tags = screen.getByLabelText("Tags");
		expect(tags).toHaveValue("general");
		fireEvent.change(tags, { target: { value: "general, billing" } });
		expect(screen.getByTestId("diff-summary")).toHaveTextContent("~1 changed");
	});

	it("renders all five flags and toggles one on", () => {
		renderAuthor();
		selectField("app.name");
		for (const k of ["nullable", "readOnly", "writeOnce", "sensitive", "deprecated"]) {
			expect(screen.getByTestId(`flag-${k}`)).toBeInTheDocument();
		}
		const nullableToggle = within(screen.getByTestId("flag-nullable")).getByLabelText("Nullable");
		fireEvent.click(nullableToggle);
		expect(screen.getByTestId("diff-summary")).toHaveTextContent("~1 changed");
	});

	it("reveals the redirect_to input when deprecated is toggled on, and clears it when off", () => {
		renderAuthor();
		selectField("app.name");
		const card = screen.getByTestId("flag-deprecated");
		fireEvent.click(within(card).getByLabelText("Deprecated"));
		const redirect = within(card).getByLabelText("Redirect to");
		fireEvent.change(redirect, { target: { value: "payments.fee_rate" } });
		expect(redirect).toHaveValue("payments.fee_rate");
		// Toggle off → input gone.
		fireEvent.click(within(card).getByLabelText("Deprecated"));
		expect(within(card).queryByLabelText("Redirect to")).toBeNull();
	});

	it("shows the existing redirect target for an already-deprecated field", () => {
		renderAuthor();
		selectField("legacy.old_fee");
		expect(screen.getByLabelText("Redirect to")).toHaveValue("payments.fee_rate");
	});

	it("edits an enum chip set — add and remove", () => {
		renderAuthor();
		selectField("payments.currency");
		const chips = screen.getByTestId("enum-chips");
		expect(within(chips).getByText("USD")).toBeInTheDocument();
		// Add a value.
		const entry = within(chips).getByLabelText("add value");
		fireEvent.change(entry, { target: { value: "GBP" } });
		fireEvent.keyDown(entry, { key: "Enter" });
		expect(within(chips).getByText("GBP")).toBeInTheDocument();
		// Remove a value.
		fireEvent.click(within(chips).getByLabelText("Remove USD"));
		expect(within(chips).queryByText("USD")).toBeNull();
	});
});

describe("SchemaAuthor — add & delete fields", () => {
	it("adds a new field, selects it, and counts it", () => {
		renderAuthor();
		fireEvent.click(screen.getByTestId("add-field"));
		expect(screen.getByTestId("field-item-new.field_1")).toBeInTheDocument();
		expect(screen.getByTestId("field-editor")).toBeInTheDocument();
		expect(screen.getByTestId("diff-summary")).toHaveTextContent("+1 added");
	});

	it("deletes a field and reflects it as removed", () => {
		renderAuthor();
		selectField("legacy.old_fee");
		fireEvent.click(screen.getByTestId("delete-field"));
		expect(screen.queryByTestId("field-item-legacy.old_fee")).toBeNull();
		expect(screen.getByTestId("diff-summary")).toHaveTextContent("−1 removed");
	});

	it("can add the first field from the empty editor", () => {
		renderAuthor();
		fireEvent.click(within(screen.getByTestId("editor-empty")).getByRole("button"));
		expect(screen.getByTestId("field-editor")).toBeInTheDocument();
	});
});

describe("SchemaAuthor — definition validation", () => {
	it("flags a duplicate path and blocks Save", () => {
		renderAuthor();
		selectField("app.version");
		fireEvent.change(screen.getByLabelText("Path"), { target: { value: "app.name" } });
		// Editing the path keeps the field selected; the dup error shows on it.
		expect(screen.getByTestId("field-editor-error")).toHaveTextContent(/Duplicate path/);
		// Both colliding list items get an error dot.
		expect(screen.getAllByTestId("field-error-dot-app.name").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByRole("button", { name: /Save draft/ })).toBeDisabled();
	});

	it("flags an invalid regex pattern", () => {
		renderAuthor();
		selectField("app.name");
		fireEvent.change(screen.getByLabelText("Pattern"), { target: { value: "(" } });
		expect(screen.getByTestId("field-editor-error")).toHaveTextContent(/valid regular expression/);
	});
});

describe("SchemaAuthor — Save draft (UpdateSchema)", () => {
	it("is disabled when the draft is clean", () => {
		renderAuthor();
		expect(screen.getByRole("button", { name: /Save draft/ })).toBeDisabled();
	});

	it("PATCHes only the changed-field delta and toasts the new draft version", async () => {
		mockClient.PATCH.mockResolvedValue({ data: { schema: { version: 3 } }, error: undefined });
		renderAuthor();
		selectField("app.name");
		fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
		fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));

		await waitFor(() => expect(mockClient.PATCH).toHaveBeenCalledTimes(1));
		const [path, opts] = mockClient.PATCH.mock.calls[0];
		expect(path).toBe("/v1/schemas/{id}");
		expect(opts.params.path.id).toBe(SCHEMA_ID);
		expect(opts.body.fields).toHaveLength(1);
		expect(opts.body.fields[0].path).toBe("app.name");
		expect(opts.body.fields[0].title).toBe("Renamed");
		expect(await screen.findByText(/draft v3 created/)).toBeInTheDocument();
	});

	it("sends removeFields when a field is deleted", async () => {
		mockClient.PATCH.mockResolvedValue({ data: { schema: { version: 3 } }, error: undefined });
		renderAuthor();
		selectField("legacy.old_fee");
		fireEvent.click(screen.getByTestId("delete-field"));
		fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
		await waitFor(() => expect(mockClient.PATCH).toHaveBeenCalledTimes(1));
		expect(mockClient.PATCH.mock.calls[0][1].body.removeFields).toEqual(["legacy.old_fee"]);
	});

	it("surfaces a save error toast", async () => {
		mockClient.PATCH.mockResolvedValue({ data: undefined, error: { message: "boom" } });
		renderAuthor();
		selectField("app.name");
		fireEvent.change(screen.getByLabelText("Title"), { target: { value: "X" } });
		fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
		expect(await screen.findByText(/Save failed: boom/)).toBeInTheDocument();
	});

	it("discards local changes with the lifecycle reset action", () => {
		renderAuthor();
		selectField("app.name");
		fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
		expect(screen.getByTestId("dirty-note")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /discard changes/ }));
		expect(screen.queryByTestId("dirty-note")).toBeNull();
	});
});

describe("SchemaAuthor — Publish (immutable, no rebind)", () => {
	it("opens a confirm modal that states publishing does not rebind tenants", () => {
		renderAuthor();
		fireEvent.click(screen.getByRole("button", { name: /Publish v2/ }));
		const modal = screen.getByTestId("publish-modal");
		expect(within(modal).getByText(/freezes v2 permanently/)).toBeInTheDocument();
		expect(within(modal).getByText(/does/)).toBeInTheDocument();
		expect(within(modal).getByText(/stay on/)).toBeInTheDocument();
	});

	it("publishing is blocked while the draft has unsaved changes", () => {
		renderAuthor();
		selectField("app.name");
		fireEvent.change(screen.getByLabelText("Title"), { target: { value: "X" } });
		expect(screen.getByRole("button", { name: /Publish v2/ })).toBeDisabled();
	});

	it("POSTs the publish with the draft version on confirm", async () => {
		mockClient.POST.mockResolvedValue({ data: {}, error: undefined });
		renderAuthor();
		fireEvent.click(screen.getByRole("button", { name: /Publish v2/ }));
		fireEvent.click(screen.getByTestId("publish-confirm"));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		const [path, opts] = mockClient.POST.mock.calls[0];
		expect(path).toBe("/v1/schemas/{id}/publish");
		expect(opts.body.version).toBe(2);
		expect(await screen.findByText(/Published v2 — now immutable/)).toBeInTheDocument();
	});

	it("cancels the publish modal without POSTing", () => {
		renderAuthor();
		fireEvent.click(screen.getByRole("button", { name: /Publish v2/ }));
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByTestId("publish-modal")).toBeNull();
		expect(mockClient.POST).not.toHaveBeenCalled();
	});

	it("toasts an error when publish fails", async () => {
		mockClient.POST.mockResolvedValue({ data: undefined, error: { message: "nope" } });
		renderAuthor();
		fireEvent.click(screen.getByRole("button", { name: /Publish v2/ }));
		fireEvent.click(screen.getByTestId("publish-confirm"));
		expect(await screen.findByText(/Publish failed: nope/)).toBeInTheDocument();
	});
});

describe("SchemaAuthor — published version is read-only", () => {
	beforeEach(() => {
		mockSchema = publishedSchema;
	});

	it("disables the editor inputs and the type picker", () => {
		renderAuthor();
		selectField("app.name");
		expect(screen.getByLabelText("Title")).toBeDisabled();
		expect(screen.getByTestId("type-FIELD_TYPE_INT")).toBeDisabled();
	});

	it("hides Add field and Delete field on a published version", () => {
		renderAuthor();
		expect(screen.queryByTestId("add-field")).toBeNull();
		selectField("app.name");
		expect(screen.queryByTestId("delete-field")).toBeNull();
	});

	it("forks a published version into a new draft via UpdateSchema", async () => {
		mockClient.PATCH.mockResolvedValue({ data: { schema: { version: 2 } }, error: undefined });
		renderAuthor();
		fireEvent.click(screen.getByTestId("fork-btn"));
		await waitFor(() => expect(mockClient.PATCH).toHaveBeenCalledTimes(1));
		expect(mockClient.PATCH.mock.calls[0][1].body.versionDescription).toMatch(/Draft from v1/);
		expect(await screen.findByText(/New draft v2 created/)).toBeInTheDocument();
	});

	it("forks from the in-banner New draft button too", async () => {
		mockClient.PATCH.mockResolvedValue({ data: { schema: { version: 2 } }, error: undefined });
		renderAuthor();
		fireEvent.click(within(screen.getByTestId("immutable-banner")).getByRole("button"));
		await waitFor(() => expect(mockClient.PATCH).toHaveBeenCalledTimes(1));
	});

	it("toasts an error when the fork fails", async () => {
		mockClient.PATCH.mockResolvedValue({ data: undefined, error: { message: "locked" } });
		renderAuthor();
		fireEvent.click(screen.getByTestId("fork-btn"));
		expect(await screen.findByText(/Could not fork: locked/)).toBeInTheDocument();
	});
});

describe("SchemaAuthor — dependent_required rule builder", () => {
	it("shows the empty state and the not-persisted degradation note", () => {
		renderAuthor();
		fireEvent.click(screen.getByTestId("field-item-rules"));
		expect(screen.getByTestId("dependent-rules")).toBeInTheDocument();
		expect(screen.getByTestId("rules-empty")).toBeInTheDocument();
		expect(screen.getByTestId("dependent-required-note")).toHaveTextContent(/not persisted/);
	});

	it("adds a complete rule and summarizes it", () => {
		renderAuthor();
		fireEvent.click(screen.getByTestId("field-item-rules"));
		fireEvent.click(screen.getByTestId("add-rule"));
		const row = screen.getByTestId("rule-0");
		fireEvent.change(within(row).getByLabelText(/Required field for rule 1/), {
			target: { value: "api.webhook_url" },
		});
		fireEvent.change(within(row).getByLabelText(/Trigger field for rule 1/), {
			target: { value: "payments.enabled" },
		});
		expect(screen.getByTestId("rules-summary")).toHaveTextContent(
			"require api.webhook_url when payments.enabled present",
		);
	});

	it("removes a rule", () => {
		renderAuthor();
		fireEvent.click(screen.getByTestId("field-item-rules"));
		fireEvent.click(screen.getByTestId("add-rule"));
		expect(screen.getByTestId("rule-0")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /Remove rule 1/ }));
		expect(screen.queryByTestId("rule-0")).toBeNull();
	});

	it("hides the rule controls on a published (read-only) schema", () => {
		mockSchema = publishedSchema;
		renderAuthor();
		fireEvent.click(screen.getByTestId("field-item-rules"));
		expect(screen.queryByTestId("add-rule")).toBeNull();
	});
});
