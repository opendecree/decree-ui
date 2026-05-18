import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ToastItem } from "../../lib/toast";
import { Toast } from "../Toast";

function makeToast(overrides: Partial<ToastItem> = {}): ToastItem {
	return {
		id: "test-id",
		severity: "info",
		message: "Test message",
		duration: 0,
		count: 1,
		createdAt: Date.now(),
		...overrides,
	};
}

describe("Toast", () => {
	it("renders message", () => {
		render(
			<Toast
				toast={makeToast({ message: "Hello world" })}
				onDismiss={() => {}}
				onShowDetails={() => {}}
			/>,
		);
		expect(screen.getByText("Hello world")).toBeInTheDocument();
	});

	it("renders role=alert for error", () => {
		render(
			<Toast
				toast={makeToast({ severity: "error" })}
				onDismiss={() => {}}
				onShowDetails={() => {}}
			/>,
		);
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("renders role=alert for warning", () => {
		render(
			<Toast
				toast={makeToast({ severity: "warning" })}
				onDismiss={() => {}}
				onShowDetails={() => {}}
			/>,
		);
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("renders role=status for success", () => {
		render(
			<Toast
				toast={makeToast({ severity: "success" })}
				onDismiss={() => {}}
				onShowDetails={() => {}}
			/>,
		);
		expect(screen.getByRole("status")).toBeInTheDocument();
	});

	it("renders role=status for info", () => {
		render(
			<Toast
				toast={makeToast({ severity: "info" })}
				onDismiss={() => {}}
				onShowDetails={() => {}}
			/>,
		);
		expect(screen.getByRole("status")).toBeInTheDocument();
	});

	it("shows count badge when count > 1", () => {
		render(<Toast toast={makeToast({ count: 3 })} onDismiss={() => {}} onShowDetails={() => {}} />);
		expect(screen.getByText("×3")).toBeInTheDocument();
	});

	it("hides count badge when count = 1", () => {
		render(<Toast toast={makeToast({ count: 1 })} onDismiss={() => {}} onShowDetails={() => {}} />);
		expect(screen.queryByText(/×/)).not.toBeInTheDocument();
	});

	it("shows Details... link when details set", () => {
		render(
			<Toast
				toast={makeToast({ details: "full error body" })}
				onDismiss={() => {}}
				onShowDetails={() => {}}
			/>,
		);
		expect(screen.getByText("Details...")).toBeInTheDocument();
	});

	it("hides Details... link when no details", () => {
		render(<Toast toast={makeToast()} onDismiss={() => {}} onShowDetails={() => {}} />);
		expect(screen.queryByText("Details...")).not.toBeInTheDocument();
	});

	it("calls onDismiss when close button clicked", () => {
		const onDismiss = vi.fn();
		render(
			<Toast toast={makeToast({ id: "abc" })} onDismiss={onDismiss} onShowDetails={() => {}} />,
		);
		fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
		expect(onDismiss).toHaveBeenCalledWith("abc");
	});

	it("calls onShowDetails when Details... clicked", () => {
		const onShowDetails = vi.fn();
		render(
			<Toast
				toast={makeToast({ details: "some details" })}
				onDismiss={() => {}}
				onShowDetails={onShowDetails}
			/>,
		);
		fireEvent.click(screen.getByText("Details..."));
		expect(onShowDetails).toHaveBeenCalledWith("some details");
	});
});
