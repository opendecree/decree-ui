import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "../../../api/schema";
import { AuthContext, type AuthContextValue } from "../../../lib/auth";
import type { Role } from "../../../lib/constants";
import { ToastProvider } from "../../../lib/toast";
import { SchemaDetail } from "../SchemaDetail";

type Schema = components["schemas"]["v1Schema"];

const SCHEMA_ID = "22222222-2222-2222-2222-222222222222";

const draftSchema: Schema = {
	id: SCHEMA_ID,
	name: "showcase",
	version: 2,
	published: false,
	checksum: "abc123",
	createdAt: "2026-01-15T00:00:00Z",
	info: { title: "Showcase", author: "platform" },
	fields: [
		{
			path: "app.name",
			title: "Application Name",
			type: "FIELD_TYPE_STRING",
			tags: ["general"],
			description: "Display name.",
			constraints: { minLength: 1, maxLength: 100 },
			defaultValue: "MyApp",
			example: "Demo",
			readOnly: false,
		},
		{
			path: "payments.fee_rate",
			title: "Fee Rate",
			type: "FIELD_TYPE_NUMBER",
			tags: ["payments"],
			constraints: { min: 0, max: 100 },
			deprecated: true,
			redirectTo: "payments.rate",
			sensitive: true,
			writeOnce: true,
		},
	],
};

const publishedSchema: Schema = { ...draftSchema, version: 1, published: true };

let mockSchema: Schema | undefined = draftSchema;
let mockLoading = false;
let mockError: Error | null = null;
const mockClient = { POST: vi.fn(), GET: vi.fn() };

vi.mock("../../../lib/hooks", () => ({
	useApiClient: () => mockClient,
	useSchema: () => ({ data: { schema: mockSchema }, isLoading: mockLoading, error: mockError }),
}));

beforeEach(() => {
	mockSchema = draftSchema;
	mockLoading = false;
	mockError = null;
	mockClient.POST.mockReset();
	mockClient.GET.mockReset();
});

function renderDetail(role: Role = "superadmin") {
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
					<MemoryRouter initialEntries={[`/schemas/${SCHEMA_ID}`]}>
						<Routes>
							<Route path="/schemas/:id" element={<SchemaDetail />} />
							<Route path="/schemas/:id/author" element={<div data-testid="author-page" />} />
						</Routes>
					</MemoryRouter>
				</Harness>
			</ToastProvider>
		</QueryClientProvider>,
	);
}

describe("SchemaDetail — render", () => {
	it("shows the schema name, info, version, and fields", () => {
		renderDetail();
		expect(screen.getByTestId("schema-detail-page")).toBeInTheDocument();
		expect(screen.getByText("showcase")).toBeInTheDocument();
		expect(screen.getByText("Showcase")).toBeInTheDocument();
		expect(screen.getByText("v2")).toBeInTheDocument();
		expect(screen.getByText("app.name")).toBeInTheDocument();
		expect(screen.getByText("abc123", { exact: false })).toBeInTheDocument();
	});

	it("expands a field row to reveal its details", () => {
		renderDetail();
		fireEvent.click(screen.getByText("app.name"));
		expect(screen.getByText(/Default/)).toBeInTheDocument();
		expect(screen.getByText("Demo")).toBeInTheDocument();
	});

	it("shows a loading skeleton", () => {
		mockLoading = true;
		const { container } = renderDetail();
		expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
	});

	it("shows an error message", () => {
		mockError = new Error("nope");
		renderDetail();
		expect(screen.getByText(/Error loading schema: nope/)).toBeInTheDocument();
	});
});

describe("SchemaDetail — authoring entry point (superadmin only)", () => {
	it("links a draft to the authoring workbench with an Edit affordance", () => {
		renderDetail("superadmin");
		const link = screen.getByTestId("author-link");
		expect(link).toHaveTextContent("Edit in workbench");
		expect(link).toHaveAttribute("href", `/schemas/${SCHEMA_ID}/author`);
	});

	it("labels the link 'New draft' for a published schema", () => {
		mockSchema = publishedSchema;
		renderDetail("superadmin");
		expect(screen.getByTestId("author-link")).toHaveTextContent("New draft");
	});

	it("hides the authoring link for admin and user", () => {
		renderDetail("admin");
		expect(screen.queryByTestId("author-link")).toBeNull();
		renderDetail("user");
		expect(screen.queryByTestId("author-link")).toBeNull();
	});
});

describe("SchemaDetail — publish + export", () => {
	it("shows Publish only for an unpublished schema and POSTs on click", async () => {
		mockClient.POST.mockResolvedValue({ data: { schema: {} }, error: undefined });
		renderDetail("superadmin");
		fireEvent.click(screen.getByRole("button", { name: "Publish" }));
		await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));
		expect(mockClient.POST.mock.calls[0][0]).toBe("/v1/schemas/{id}/publish");
	});

	it("hides Publish for an already-published schema", () => {
		mockSchema = publishedSchema;
		renderDetail("superadmin");
		expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
	});

	it("exports the schema YAML on click", async () => {
		mockClient.GET.mockResolvedValue({ data: { yamlContent: "name: showcase" }, error: undefined });
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		renderDetail("superadmin");
		fireEvent.click(screen.getByRole("button", { name: /Export/ }));
		await waitFor(() => expect(clickSpy).toHaveBeenCalled());
		clickSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it("links to the tenants using this schema", () => {
		renderDetail();
		const link = screen.getByRole("link", { name: /View tenants using this schema/ });
		expect(link).toHaveAttribute("href", `/schemas/${SCHEMA_ID}/tenants`);
	});

	it("shows a deprecated badge on a deprecated field", () => {
		renderDetail();
		const feeRow = screen.getByText("payments.fee_rate").closest("tr");
		expect(feeRow).not.toBeNull();
		expect(within(feeRow as HTMLElement).getByText("Deprecated")).toBeInTheDocument();
	});
});
