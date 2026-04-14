import { useState } from "react";
import type { components } from "../api/schema";
import { label } from "../lib/labels";

type FieldType = components["schemas"]["v1FieldType"];

interface FieldMeta {
	type?: FieldType;
	title?: string;
}

export interface PendingChangesBarProps {
	/** Map of field path -> new value string. */
	pendingChanges: Map<string, string>;
	/** Map of field path -> current server value string. */
	serverValues: Map<string, string>;
	/** Map of field path -> field metadata for display. */
	fieldMeta: Map<string, FieldMeta>;
	/** Description for the batch update. */
	description: string;
	onDescriptionChange: (value: string) => void;
	/** Apply all pending changes. */
	onApply: () => void;
	/** Reset all pending changes. */
	onReset: () => void;
	/** Whether the apply mutation is in progress. */
	isApplying: boolean;
	/** Error message from the last apply attempt. */
	applyError: string | null;
}

/** Sticky bottom bar that appears when there are pending config changes. */
export function PendingChangesBar({
	pendingChanges,
	serverValues,
	fieldMeta,
	description,
	onDescriptionChange,
	onApply,
	onReset,
	isApplying,
	applyError,
}: PendingChangesBarProps) {
	const [showReview, setShowReview] = useState(false);
	const count = pendingChanges.size;

	if (count === 0) return null;

	return (
		<div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
			{showReview && (
				<div className="mx-auto max-w-5xl border-b border-gray-200 px-6 py-4 dark:border-gray-700">
					<h3 className="mb-3 text-sm font-semibold">Review Changes</h3>
					<div className="max-h-60 space-y-2 overflow-y-auto">
						{[...pendingChanges.entries()].map(([path, newValue]) => {
							const old = serverValues.get(path) ?? "";
							const meta = fieldMeta.get(path);
							return (
								<div
									key={path}
									className="rounded border border-gray-100 bg-gray-50 p-2 text-sm dark:border-gray-800 dark:bg-gray-800"
								>
									<span className="font-mono text-xs font-medium">{meta?.title ?? path}</span>
									<div className="mt-1 flex items-center gap-2 text-xs">
										<span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-300">
											{old || "(empty)"}
										</span>
										<span className="text-gray-400">&rarr;</span>
										<span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-300">
											{newValue || "(empty)"}
										</span>
									</div>
								</div>
							);
						})}
					</div>
					<div className="mt-3">
						<textarea
							value={description}
							onChange={(e) => onDescriptionChange(e.target.value)}
							placeholder="Optional: describe why these changes are being made..."
							rows={2}
							className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
						/>
					</div>
				</div>
			)}

			{applyError && (
				<div className="mx-auto max-w-5xl px-6 pt-2">
					<p className="text-sm text-red-600 dark:text-red-400">{applyError}</p>
				</div>
			)}

			<div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
				<span className="text-sm font-medium">
					{count} {label("config.pendingChanges")}
				</span>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={onReset}
						disabled={isApplying}
						className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
					>
						{label("config.resetAll")}
					</button>
					<button
						type="button"
						onClick={() => {
							if (showReview) {
								onApply();
							} else {
								setShowReview(true);
							}
						}}
						disabled={isApplying}
						className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{isApplying
							? label("config.applying")
							: showReview
								? label("config.apply")
								: label("config.reviewAndApply")}
					</button>
					{showReview && (
						<button
							type="button"
							onClick={() => setShowReview(false)}
							disabled={isApplying}
							className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
						>
							Close
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
