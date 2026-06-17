import { useMemo, useState } from "react";
import type { components } from "../api/schema";

type SchemaField = components["schemas"]["v1SchemaField"];

/** One field whose staged edit collided with a newer committed value. */
export interface FieldConflict {
	path: string;
	field: SchemaField;
	/** The value the user staged (based on the now-stale version). */
	mine: string;
	/** The value currently committed on the server (the fresh version). */
	theirs: string;
	/** The fresh checksum the user must rebase onto. */
	freshChecksum: string | undefined;
}

/** Per-field rebase choice: re-apply the user's edit, or accept the server's value. */
export type Resolution = "mine" | "theirs";

export interface ConflictResolverProps {
	open: boolean;
	/** Version the staged edit was based on (stale). */
	staleVersion: number | undefined;
	/** Version now committed on the server. */
	freshVersion: number | undefined;
	conflicts: FieldConflict[];
	onCancel: () => void;
	/**
	 * Rebase onto the fresh version with the chosen resolutions. "mine" fields are
	 * re-applied against the fresh checksum; "theirs" fields are dropped from the
	 * batch (the server value wins).
	 */
	onRebase: (resolutions: Map<string, Resolution>) => void;
	isApplying: boolean;
}

/**
 * Optimistic-concurrency conflict resolver. A `SetFields` batch is atomic, so a
 * single stale checksum rejects the whole write with `ABORTED`. This surfaces the
 * three-way choice per conflicting field — keep mine / take theirs / compare — and
 * lets the user rebase their edit onto the server's fresh checksums and retry.
 *
 * Modeled on Screen-1 of the redesign: re-fetch latest checksum, re-submit.
 */
export function ConflictResolver({
	open,
	staleVersion,
	freshVersion,
	conflicts,
	onCancel,
	onRebase,
	isApplying,
}: ConflictResolverProps) {
	// Default every conflict to "keep mine" — the rebase re-applies the user's intent.
	const [choices, setChoices] = useState<Map<string, Resolution>>(
		() => new Map(conflicts.map((c) => [c.path, "mine"])),
	);

	// Re-seed when the conflict set changes (a fresh rejection opens the panel anew).
	const conflictKey = useMemo(() => conflicts.map((c) => c.path).join("|"), [conflicts]);
	const [seededKey, setSeededKey] = useState(conflictKey);
	if (conflictKey !== seededKey) {
		setSeededKey(conflictKey);
		setChoices(new Map(conflicts.map((c) => [c.path, "mine"])));
	}

	if (!open) return null;

	const pick = (path: string, res: Resolution) => {
		setChoices((prev) => {
			const next = new Map(prev);
			next.set(path, res);
			return next;
		});
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Resolve concurrency conflict"
			data-testid="conflict-resolver"
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
			<div
				role="presentation"
				className="absolute inset-0 bg-black/40"
				onClick={isApplying ? undefined : onCancel}
			/>
			<div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--r-lg)] border border-line-2 bg-surface shadow-[var(--sh-2)]">
				<header className="flex items-start gap-3 border-b border-line px-5 py-4">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="mt-0.5 h-5 w-5 flex-none text-danger"
					>
						<path d="M4 12a8 8 0 0 1 13-6m3-2v5h-5M20 12a8 8 0 0 1-13 6m-3 2v-5h5" />
					</svg>
					<div className="min-w-0">
						<h2 className="text-sm font-semibold text-fg">
							Conflict — your edit is based on an old version
						</h2>
						<p className="mt-1 text-xs text-fg-2">
							<code className="font-mono text-fg">SetFields</code> is atomic and was{" "}
							<b className="font-semibold text-danger">rejected whole</b> (stale checksums). The
							config advanced
							{staleVersion !== undefined && freshVersion !== undefined ? (
								<>
									{" "}
									from <span className="font-mono">v{staleVersion}</span> to{" "}
									<span className="font-mono">v{freshVersion}</span>
								</>
							) : null}{" "}
							after you staged. Choose what to keep, then rebase to re-apply against the fresh
							checksums.
						</p>
					</div>
				</header>

				<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
					{conflicts.map((c) => {
						const choice = choices.get(c.path) ?? "mine";
						return (
							<div
								key={c.path}
								data-testid={`conflict-${c.path}`}
								className="rounded-[var(--r-md)] border border-line bg-surface-2 p-3"
							>
								<div className="mb-2 flex flex-wrap items-center gap-2">
									<span className="text-sm font-medium text-fg">{c.field.title ?? c.path}</span>
									<code className="font-mono text-xs text-fg-3">{c.path}</code>
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									<ChoiceCard
										label="Take theirs"
										sub={freshVersion !== undefined ? `committed · v${freshVersion}` : "committed"}
										value={c.theirs}
										tone="theirs"
										selected={choice === "theirs"}
										onSelect={() => pick(c.path, "theirs")}
									/>
									<ChoiceCard
										label="Keep mine"
										sub="your staged edit"
										value={c.mine}
										tone="mine"
										selected={choice === "mine"}
										onSelect={() => pick(c.path, "mine")}
									/>
								</div>
							</div>
						);
					})}
				</div>

				<footer className="flex items-center gap-2 border-t border-line px-5 py-3">
					<span className="text-xs text-fg-3">
						{conflicts.length} conflicting field{conflicts.length === 1 ? "" : "s"}
					</span>
					<span className="flex-1" />
					<button
						type="button"
						onClick={onCancel}
						disabled={isApplying}
						className="rounded-[var(--r-sm)] border border-line-2 bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-3 disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => onRebase(choices)}
						disabled={isApplying}
						className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-50"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="h-3.5 w-3.5"
						>
							<path d="M4 12a8 8 0 0 1 13-6m3-2v5h-5M20 12a8 8 0 0 1-13 6m-3 2v-5h5" />
						</svg>
						{isApplying ? "Rebasing…" : "Rebase & save"}
					</button>
				</footer>
			</div>
		</div>
	);
}

function ChoiceCard({
	label,
	sub,
	value,
	tone,
	selected,
	onSelect,
}: {
	label: string;
	sub: string;
	value: string;
	tone: "mine" | "theirs";
	selected: boolean;
	onSelect: () => void;
}) {
	// Static class strings (no interpolation) so Tailwind's token utilities compile.
	const selectedBox =
		tone === "mine" ? "border-accent-line bg-accent-soft" : "border-ok bg-ok-soft";
	const selectedDot = tone === "mine" ? "bg-accent border-transparent" : "bg-ok border-transparent";
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={`flex flex-col gap-1 rounded-[var(--r-sm)] border p-2.5 text-left ${
				selected ? selectedBox : "border-line bg-surface hover:bg-surface-3"
			}`}
		>
			<span className="flex items-center gap-1.5 text-xs font-medium text-fg-2">
				<span
					className={`h-2.5 w-2.5 rounded-full border ${
						selected ? selectedDot : "border-line-2 bg-transparent"
					}`}
					aria-hidden="true"
				/>
				{label}
				<span className="font-mono text-[10px] text-fg-3">· {sub}</span>
			</span>
			<code className="block max-h-24 overflow-auto break-all font-mono text-xs text-fg">
				{value === "" ? "(empty)" : value}
			</code>
		</button>
	);
}
