import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type AuditChainBreak, ChainBreakPanel, type ChainVerification } from "../ChainBreakPanel";

const aBreak: AuditChainBreak = {
	entryId: "a3f2-84",
	position: 83,
	got: "0a44aaaaaaaaaaaab02",
	want: "9f3abbbbbbbbbbbbe21",
	actor: "dave@acme",
	action: "set_field payments.fee_rate",
};

describe("ChainBreakPanel — pending (no gateway support / chain intact)", () => {
	it("degrades to a pending-server note when no verification is supplied", () => {
		render(<ChainBreakPanel />);
		const pending = screen.getByTestId("chain-break-pending");
		expect(pending).toHaveTextContent(/not yet exposed by the REST gateway/);
		expect(pending).toHaveTextContent(/VerifyChain/);
		expect(screen.queryByTestId("chain-break-panel")).toBeNull();
	});

	it("degrades to the pending note when the breaks list is empty (chain intact)", () => {
		const verification: ChainVerification = { total: 128, ok: true, breaks: [] };
		render(<ChainBreakPanel verification={verification} />);
		expect(screen.getByTestId("chain-break-pending")).toBeInTheDocument();
		expect(screen.queryByTestId("chain-break-badge")).toBeNull();
	});
});

describe("ChainBreakPanel — broken chain (AuditChainBreak shape)", () => {
	it("renders got = stored, want = recomputed, entry_id and 0-based position", () => {
		const verification: ChainVerification = { total: 128, ok: false, breaks: [aBreak] };
		render(<ChainBreakPanel verification={verification} />);
		expect(screen.getByTestId("chain-break-panel")).toBeInTheDocument();
		expect(screen.getByTestId("chain-break-badge")).toHaveTextContent(/chain BROKEN/);

		// got = the stored entry hash; want = the recomputed SHA-256 (not inverted).
		expect(screen.getByTestId("chain-break-got")).toHaveTextContent(/stored on the entry/);
		expect(screen.getByTestId("chain-break-want")).toHaveTextContent(/SHA-256 of entry/);
		// Short-hashed head…tail of each.
		expect(screen.getByTestId("chain-break-got")).toHaveTextContent(/0a44…b02/);
		expect(screen.getByTestId("chain-break-want")).toHaveTextContent(/9f3a…e21/);

		// entry_id + the literal 0-based position.
		const panel = screen.getByTestId("chain-break-panel");
		expect(within(panel).getByText(/a3f2-84/)).toBeInTheDocument();
		expect(within(panel).getAllByText(/position 83/).length).toBeGreaterThan(0);
		expect(within(panel).getByText(/0-based/)).toBeInTheDocument();
		// Total threaded into the summary line.
		expect(within(panel).getByText(/of 128/)).toBeInTheDocument();
	});

	it("renders the optional actor · action row when present", () => {
		render(<ChainBreakPanel verification={{ breaks: [aBreak] }} />);
		const panel = screen.getByTestId("chain-break-panel");
		expect(within(panel).getByText(/dave@acme/)).toBeInTheDocument();
		expect(within(panel).getByText(/set_field payments\.fee_rate/)).toBeInTheDocument();
	});

	it("omits the actor row and the total when neither is supplied", () => {
		const minimal: AuditChainBreak = { entryId: "x-1", position: 0, got: "aaaa", want: "bbbb" };
		render(<ChainBreakPanel verification={{ breaks: [minimal] }} />);
		const panel = screen.getByTestId("chain-break-panel");
		// No actor → no "actor · action" label.
		expect(within(panel).queryByText(/actor · action/)).toBeNull();
		// No total → the summary omits the "of N" total suffix.
		expect(within(panel).queryByText(/of \d/)).toBeNull();
		// position 0 still renders (0-based).
		expect(within(panel).getAllByText(/position 0/).length).toBeGreaterThan(0);
	});

	it("does not shorten a hash that is already short", () => {
		const shortBreak: AuditChainBreak = { entryId: "x", position: 1, got: "abc", want: "def" };
		render(<ChainBreakPanel verification={{ breaks: [shortBreak] }} />);
		expect(screen.getByTestId("chain-break-got")).toHaveTextContent(/abc/);
		expect(screen.getByTestId("chain-break-want")).toHaveTextContent(/def/);
	});

	it("notes when there is more than one break (the proto returns a list)", () => {
		const second: AuditChainBreak = { entryId: "b-2", position: 90, got: "1111", want: "2222" };
		render(<ChainBreakPanel verification={{ total: 128, breaks: [aBreak, second] }} />);
		expect(screen.getByText(/2 breaks total/)).toBeInTheDocument();
		// Only the first break's detail is rendered (chain untrusted from there on).
		expect(screen.getByTestId("chain-break-got")).toHaveTextContent(/0a44…b02/);
		expect(screen.queryByText(/1111/)).toBeNull();
	});
});
