import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUnusedFields } from "../hooks";

// Drive the hook against a fake API client so we exercise the query function's
// success + error branches. useApiClient just wraps createApiClient(auth).
const get = vi.fn();
vi.mock("../../api/client", () => ({
	createApiClient: () => ({ GET: get }),
}));
vi.mock("../auth", () => ({
	useAuth: () => ({ auth: { subject: "admin", role: "superadmin" } }),
}));

function wrapper({ children }: { children: ReactNode }) {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("useUnusedFields", () => {
	it("returns the field paths on success and passes the since query", async () => {
		get.mockResolvedValue({ data: { fieldPaths: ["legacy.old_fee"] }, error: null });
		const { result } = renderHook(() => useUnusedFields("t1", "2026-05-01T00:00:00Z"), {
			wrapper,
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.fieldPaths).toEqual(["legacy.old_fee"]);
		expect(get).toHaveBeenCalledWith("/v1/tenants/{tenantId}/unused-fields", {
			params: { path: { tenantId: "t1" }, query: { since: "2026-05-01T00:00:00Z" } },
		});
	});

	it("omits the since param when none is given", async () => {
		get.mockResolvedValue({ data: { fieldPaths: [] }, error: null });
		const { result } = renderHook(() => useUnusedFields("t1"), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(get).toHaveBeenCalledWith("/v1/tenants/{tenantId}/unused-fields", {
			params: { path: { tenantId: "t1" }, query: {} },
		});
	});

	it("throws the formatted error when the gateway returns one", async () => {
		get.mockResolvedValue({ data: undefined, error: { message: "scan failed" } });
		const { result } = renderHook(() => useUnusedFields("t1"), { wrapper });
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error?.message).toBe("scan failed");
	});

	it("is disabled (does not fetch) without a tenant id", () => {
		renderHook(() => useUnusedFields(""), { wrapper });
		expect(get).not.toHaveBeenCalled();
	});
});
