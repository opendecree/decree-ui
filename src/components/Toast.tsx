import { useEffect, useRef } from "react";
import type { ToastItem } from "../lib/toast";

interface Props {
	toast: ToastItem;
	onDismiss: (id: string) => void;
	onShowDetails: (content: string | React.ReactNode) => void;
}

const ICONS: Record<string, string> = {
	error: "✕",
	warning: "⚠",
	success: "✓",
	info: "ℹ",
};

const COLORS: Record<string, { bar: string; icon: string; text: string; badge: string }> = {
	error: {
		bar: "bg-red-50 border-l-4 border-red-600 dark:bg-red-950 dark:border-red-500",
		icon: "text-red-600 dark:text-red-400",
		text: "text-gray-900 dark:text-gray-100",
		badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
	},
	warning: {
		bar: "bg-yellow-50 border-l-4 border-yellow-600 dark:bg-yellow-950 dark:border-yellow-500",
		icon: "text-yellow-600 dark:text-yellow-400",
		text: "text-gray-900 dark:text-gray-100",
		badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
	},
	success: {
		bar: "bg-green-50 border-l-4 border-green-600 dark:bg-green-950 dark:border-green-500",
		icon: "text-green-600 dark:text-green-400",
		text: "text-gray-900 dark:text-gray-100",
		badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
	},
	info: {
		bar: "bg-blue-50 border-l-4 border-blue-600 dark:bg-blue-950 dark:border-blue-500",
		icon: "text-blue-600 dark:text-blue-400",
		text: "text-gray-900 dark:text-gray-100",
		badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
	},
};

const ARIA_ROLES: Record<string, string> = {
	error: "alert",
	warning: "alert",
	success: "status",
	info: "status",
};

function prefersReducedMotion() {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

export function Toast({ toast, onDismiss, onShowDetails }: Props) {
	const c = COLORS[toast.severity];
	const remainingRef = useRef(toast.duration);
	const startRef = useRef<number | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (toast.duration === 0) return;

		function start() {
			startRef.current = Date.now();
			timerRef.current = setTimeout(() => {
				onDismiss(toast.id);
			}, remainingRef.current);
		}

		start();
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [toast.id, toast.duration, onDismiss]);

	function handleMouseEnter() {
		if (toast.duration === 0) return;
		if (timerRef.current) clearTimeout(timerRef.current);
		if (startRef.current !== null) {
			remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startRef.current));
		}
	}

	function handleMouseLeave() {
		if (toast.duration === 0) return;
		startRef.current = Date.now();
		timerRef.current = setTimeout(() => {
			onDismiss(toast.id);
		}, remainingRef.current);
	}

	const motionClass = prefersReducedMotion() ? "" : "animate-[slide-in_0.2s_ease-out]";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover pause is supplemental; keyboard access via close button
		<div
			role={ARIA_ROLES[toast.severity]}
			className={`flex w-full max-w-sm items-start gap-3 rounded-md px-4 py-3 shadow-lg ${c.bar} ${motionClass}`}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<span className={`mt-0.5 shrink-0 text-sm font-bold ${c.icon}`}>{ICONS[toast.severity]}</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className={`text-sm leading-snug ${c.text}`}>{toast.message}</span>
				{toast.details !== undefined && (
					<button
						type="button"
						className="self-start text-xs underline opacity-70 hover:opacity-100"
						onClick={() => onShowDetails(toast.details)}
					>
						Details...
					</button>
				)}
			</div>
			{toast.count > 1 && (
				<span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${c.badge}`}>
					×{toast.count}
				</span>
			)}
			<button
				type="button"
				aria-label="Dismiss notification"
				className="shrink-0 opacity-50 hover:opacity-100"
				onClick={() => onDismiss(toast.id)}
			>
				<span className={`text-xs ${c.text}`}>✕</span>
			</button>
		</div>
	);
}
