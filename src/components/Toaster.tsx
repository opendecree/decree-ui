import { useContext } from "react";
import { ToastContext } from "../lib/toast";
import { SlideOver } from "./SlideOver";
import { Toast } from "./Toast";

export function Toaster() {
	const { toasts, dismiss, dismissAll, detailsOpen, detailsContent, openDetails, closeDetails } =
		useContext(ToastContext);

	if (toasts.length === 0 && !detailsOpen) return null;

	return (
		<>
			{toasts.length > 0 && (
				<section
					aria-label="Notifications"
					className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2 sm:bottom-4 sm:left-auto sm:right-4 sm:top-auto sm:translate-x-0 sm:w-auto"
				>
					{toasts.map((t) => (
						<div key={t.id} className="pointer-events-auto">
							<Toast toast={t} onDismiss={dismiss} onShowDetails={openDetails} />
						</div>
					))}
					{toasts.length >= 2 && (
						<div className="pointer-events-auto flex justify-end">
							<button
								type="button"
								onClick={dismissAll}
								className="rounded px-2 py-1 text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
							>
								Clear all
							</button>
						</div>
					)}
				</section>
			)}
			<SlideOver open={detailsOpen} onClose={closeDetails} title="Details">
				{typeof detailsContent === "string" ? (
					<pre className="whitespace-pre-wrap break-all text-sm text-gray-800 dark:text-gray-200">
						{detailsContent}
					</pre>
				) : (
					detailsContent
				)}
			</SlideOver>
		</>
	);
}
