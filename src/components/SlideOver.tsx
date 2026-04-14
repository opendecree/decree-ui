import { useEffect } from "react";

interface SlideOverProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}

/** Reusable slide-over panel from the right edge. */
export function SlideOver({ open, onClose, title, children }: SlideOverProps) {
	useEffect(() => {
		if (!open) return;
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleEsc);
		return () => document.removeEventListener("keydown", handleEsc);
	}, [open, onClose]);

	return (
		<>
			{/* Backdrop */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss via click */}
			<div
				role="presentation"
				className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
				onClick={onClose}
			/>

			{/* Panel */}
			<div
				className={`fixed inset-y-0 right-0 z-50 w-full max-w-md transform bg-white shadow-xl transition-transform dark:bg-gray-900 ${open ? "translate-x-0" : "translate-x-full"}`}
			>
				<div className="flex h-full flex-col">
					<div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
						<h2 className="text-lg font-semibold">{title}</h2>
						<button
							type="button"
							onClick={onClose}
							className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								className="h-5 w-5"
							>
								<title>Close</title>
								<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
							</svg>
						</button>
					</div>
					<div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
				</div>
			</div>
		</>
	);
}
