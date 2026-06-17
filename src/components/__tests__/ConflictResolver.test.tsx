import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { components } from "../../api/schema";
import {
	ConflictResolver,
	type ConflictResolverProps,
	type FieldConflict,
	type Resolution,
} from "../ConflictResolver";

type SchemaField = components["schemas"]["v1SchemaField"];

const feeField: SchemaField = {
	path: "payments.fee_rate",
	title: "Fee Rate",
	type: "FIELD_TYPE_NUMBER",
};
const retriesField: SchemaField = {
	path: "payments.retries",
	// no title — falls back to the path
	type: "FIELD_TYPE_INT",
};

const twoConflicts: FieldConflict[] = [
	{ path: "payments.fee_rate", field: feeField, mine: "2.5", theirs: "3", freshChecksum: "c9d0" },
	{
		path: "payments.retries",
		field: retriesField,
		mine: "5",
		theirs: "",
		freshChecksum: "ab12",
	},
];

function renderResolver(overrides: Partial<ConflictResolverProps> = {}) {
	const onCancel = vi.fn();
	const onRebase = vi.fn<(r: Map<string, Resolution>) => void>();
	const props: ConflictResolverProps = {
		open: true,
		staleVersion: 7,
		freshVersion: 8,
		conflicts: twoConflicts,
		onCancel,
		onRebase,
		isApplying: false,
		...overrides,
	};
	const utils = render(<ConflictResolver {...props} />);
	return { onCancel, onRebase, ...utils };
}

describe("ConflictResolver — visibility", () => {
	it("renders nothing when closed", () => {
		renderResolver({ open: false });
		expect(screen.queryByTestId("conflict-resolver")).toBeNull();
	});

	it("renders a modal dialog when open", () => {
		renderResolver();
		const dialog = screen.getByTestId("conflict-resolver");
		expect(dialog).toHaveAttribute("role", "dialog");
		expect(dialog).toHaveAttribute("aria-modal", "true");
		expect(within(dialog).getByText(/rejected whole/)).toBeInTheDocument();
	});
});

describe("ConflictResolver — conflict rendering", () => {
	it("shows the stale → fresh version transition", () => {
		renderResolver();
		expect(screen.getByText("v7")).toBeInTheDocument();
		expect(screen.getByText("v8")).toBeInTheDocument();
	});

	it("renders one card per conflict with the field title (or path fallback) and mine/theirs values", () => {
		renderResolver();
		const feeRow = screen.getByTestId("conflict-payments.fee_rate");
		expect(within(feeRow).getByText("Fee Rate")).toBeInTheDocument();
		expect(within(feeRow).getByText("2.5")).toBeInTheDocument(); // mine
		expect(within(feeRow).getByText("3")).toBeInTheDocument(); // theirs

		const retriesRow = screen.getByTestId("conflict-payments.retries");
		// No title → the path is used as the field label.
		expect(within(retriesRow).getAllByText("payments.retries").length).toBeGreaterThan(0);
	});

	it("renders an empty server value as (empty)", () => {
		renderResolver();
		const retriesRow = screen.getByTestId("conflict-payments.retries");
		// theirs is "" for retries → the "Take theirs" card shows (empty).
		expect(within(retriesRow).getByText("(empty)")).toBeInTheDocument();
	});

	it("pluralises the conflicting-field count", () => {
		renderResolver();
		expect(screen.getByText(/2 conflicting fields/)).toBeInTheDocument();
	});

	it("uses the singular form for exactly one conflict", () => {
		renderResolver({ conflicts: [twoConflicts[0]] });
		expect(screen.getByText(/1 conflicting field$/)).toBeInTheDocument();
	});

	it("omits the version transition when either version is undefined", () => {
		renderResolver({ staleVersion: undefined, freshVersion: undefined });
		expect(screen.queryByText("v7")).toBeNull();
		// The 'committed' card sub-label drops the version too.
		expect(screen.getAllByText(/committed$/).length).toBeGreaterThan(0);
	});
});

describe("ConflictResolver — per-field selection", () => {
	it("defaults every field to 'Keep mine' (aria-pressed)", () => {
		renderResolver();
		const feeRow = screen.getByTestId("conflict-payments.fee_rate");
		expect(within(feeRow).getByRole("button", { name: /Keep mine/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(within(feeRow).getByRole("button", { name: /Take theirs/ })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("switches a field to 'Take theirs' on click", () => {
		renderResolver();
		const feeRow = screen.getByTestId("conflict-payments.fee_rate");
		fireEvent.click(within(feeRow).getByRole("button", { name: /Take theirs/ }));
		expect(within(feeRow).getByRole("button", { name: /Take theirs/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(within(feeRow).getByRole("button", { name: /Keep mine/ })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});
});

describe("ConflictResolver — actions", () => {
	it("invokes onCancel from the Cancel button", () => {
		const { onCancel } = renderResolver();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("invokes onCancel when the backdrop is clicked", () => {
		const { onCancel } = renderResolver();
		fireEvent.click(screen.getByRole("presentation"));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("invokes onRebase with the default (all 'mine') resolutions", () => {
		const { onRebase } = renderResolver();
		fireEvent.click(screen.getByRole("button", { name: /Rebase & save/ }));
		expect(onRebase).toHaveBeenCalledTimes(1);
		const resolutions = onRebase.mock.calls[0][0];
		expect(resolutions.get("payments.fee_rate")).toBe("mine");
		expect(resolutions.get("payments.retries")).toBe("mine");
	});

	it("invokes onRebase reflecting a per-field 'take theirs' choice", () => {
		const { onRebase } = renderResolver();
		const feeRow = screen.getByTestId("conflict-payments.fee_rate");
		fireEvent.click(within(feeRow).getByRole("button", { name: /Take theirs/ }));
		fireEvent.click(screen.getByRole("button", { name: /Rebase & save/ }));
		const resolutions = onRebase.mock.calls[0][0];
		expect(resolutions.get("payments.fee_rate")).toBe("theirs");
		expect(resolutions.get("payments.retries")).toBe("mine");
	});

	it("disables both footer buttons and the backdrop dismiss while applying", () => {
		const { onCancel } = renderResolver({ isApplying: true });
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		expect(screen.getByRole("button", { name: /Rebasing…/ })).toBeDisabled();
		// Backdrop click is a no-op while applying.
		fireEvent.click(screen.getByRole("presentation"));
		expect(onCancel).not.toHaveBeenCalled();
	});
});

describe("ConflictResolver — re-seeding on a new conflict set", () => {
	it("resets choices to 'mine' when the conflict set changes", () => {
		const { rerender } = renderResolver();
		const feeRow = screen.getByTestId("conflict-payments.fee_rate");
		fireEvent.click(within(feeRow).getByRole("button", { name: /Take theirs/ }));
		expect(within(feeRow).getByRole("button", { name: /Take theirs/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		// A fresh rejection brings a different conflict set → choices re-seed to "mine".
		const newConflicts: FieldConflict[] = [
			{
				path: "app.name",
				field: { path: "app.name", type: "FIELD_TYPE_STRING" },
				mine: "x",
				theirs: "y",
				freshChecksum: "zz",
			},
		];
		rerender(
			<ConflictResolver
				open
				staleVersion={8}
				freshVersion={9}
				conflicts={newConflicts}
				onCancel={vi.fn()}
				onRebase={vi.fn()}
				isApplying={false}
			/>,
		);
		const nameRow = screen.getByTestId("conflict-app.name");
		expect(within(nameRow).getByRole("button", { name: /Keep mine/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});
});
