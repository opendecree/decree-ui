import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../toast";

function wrapper({ children }: { children: React.ReactNode }) {
	return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("toast.error adds a toast and returns id", () => {
		const { result } = renderHook(() => useToast(), { wrapper });
		let id = "";
		act(() => {
			id = result.current.toast.error("Something broke");
		});
		// useToast doesn't expose toasts directly — use context
		// Just verify id is a non-empty string
		expect(id).toBeTruthy();
		expect(typeof id).toBe("string");
	});
});

// Test ToastContext state more directly
import { useContext } from "react";
import { ToastContext } from "../toast";

function useToastCtx() {
	return useContext(ToastContext);
}

describe("ToastContext provider", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("adds toast to list", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		act(() => {
			result.current.add("error", "Oops");
		});
		expect(result.current.toasts).toHaveLength(1);
		expect(result.current.toasts[0].severity).toBe("error");
		expect(result.current.toasts[0].message).toBe("Oops");
		expect(result.current.toasts[0].count).toBe(1);
	});

	it("dedup within 2s bumps count instead of adding", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		act(() => {
			result.current.add("error", "Oops");
			result.current.add("error", "Oops");
		});
		expect(result.current.toasts).toHaveLength(1);
		expect(result.current.toasts[0].count).toBe(2);
	});

	it("dedup after 2s window adds new toast", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		act(() => {
			result.current.add("error", "Oops");
		});
		act(() => {
			vi.advanceTimersByTime(2001);
			result.current.add("error", "Oops");
		});
		expect(result.current.toasts).toHaveLength(2);
	});

	it("queues 4th toast; pops when one dismissed", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		act(() => {
			result.current.add("info", "A");
			result.current.add("info", "B");
			result.current.add("info", "C");
			result.current.add("info", "D");
		});
		expect(result.current.toasts).toHaveLength(3);
		act(() => {
			result.current.dismiss(result.current.toasts[0].id);
		});
		expect(result.current.toasts).toHaveLength(3);
		expect(result.current.toasts[2].message).toBe("D");
	});

	it("dismissAll clears visible and queue", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		act(() => {
			result.current.add("info", "A");
			result.current.add("info", "B");
			result.current.add("info", "C");
			result.current.add("info", "D");
		});
		act(() => {
			result.current.dismissAll();
		});
		expect(result.current.toasts).toHaveLength(0);
		// Queue cleared — add one more to verify no D pops
		act(() => {
			result.current.add("info", "E");
		});
		expect(result.current.toasts).toHaveLength(1);
		expect(result.current.toasts[0].message).toBe("E");
	});

	it("update mutates toast in place", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		let id = "";
		act(() => {
			id = result.current.add("info", "Loading...", { duration: 0 });
		});
		act(() => {
			result.current.update(id, { severity: "success", message: "Done!" });
		});
		const t = result.current.toasts.find((x) => x.id === id);
		expect(t?.severity).toBe("success");
		expect(t?.message).toBe("Done!");
	});

	it("openDetails sets content and detailsOpen", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		act(() => {
			result.current.openDetails("error body");
		});
		expect(result.current.detailsOpen).toBe(true);
		expect(result.current.detailsContent).toBe("error body");
	});

	it("closeDetails sets detailsOpen false", () => {
		const { result } = renderHook(() => useToastCtx(), { wrapper });
		act(() => {
			result.current.openDetails("x");
			result.current.closeDetails();
		});
		expect(result.current.detailsOpen).toBe(false);
	});
});
