import { createContext, type ReactNode, useContext, useRef, useState } from "react";
import { Toaster } from "../components/Toaster";

export type Severity = "error" | "warning" | "success" | "info";

export interface ToastItem {
	id: string;
	severity: Severity;
	message: string;
	details?: ReactNode | string;
	duration: number;
	count: number;
	createdAt: number;
}

export interface ToastOptions {
	details?: ReactNode | string;
	duration?: number;
	id?: string;
}

export interface UpdateOptions {
	severity?: Severity;
	message?: string;
	details?: ReactNode | string;
	duration?: number;
}

interface ToastContextValue {
	toasts: ToastItem[];
	add: (severity: Severity, message: string, opts?: ToastOptions) => string;
	update: (id: string, opts: UpdateOptions) => void;
	dismiss: (id: string) => void;
	dismissAll: () => void;
	detailsContent: ReactNode | string | null;
	detailsOpen: boolean;
	openDetails: (content: ReactNode | string) => void;
	closeDetails: () => void;
}

const MAX_VISIBLE = 3;
const DEDUP_WINDOW_MS = 2000;

const DEFAULT_DURATIONS: Record<Severity, number> = {
	error: 0,
	warning: 6000,
	success: 3000,
	info: 4000,
};

const defaultContext: ToastContextValue = {
	toasts: [],
	add: () => "",
	update: () => {},
	dismiss: () => {},
	dismissAll: () => {},
	detailsContent: null,
	detailsOpen: false,
	openDetails: () => {},
	closeDetails: () => {},
};

export const ToastContext = createContext<ToastContextValue>(defaultContext);

export function useToast() {
	const ctx = useContext(ToastContext);
	const { add, update, dismiss, dismissAll } = ctx;

	const toast = {
		error: (message: string, opts?: ToastOptions) => add("error", message, opts),
		warning: (message: string, opts?: ToastOptions) => add("warning", message, opts),
		success: (message: string, opts?: ToastOptions) => add("success", message, opts),
		info: (message: string, opts?: ToastOptions) => add("info", message, opts),
		update,
	};

	return { toast, dismiss, dismissAll };
}

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [detailsContent, setDetailsContent] = useState<ReactNode | string | null>(null);
	const queueRef = useRef<ToastItem[]>([]);

	function add(severity: Severity, message: string, opts?: ToastOptions): string {
		const id = opts?.id ?? crypto.randomUUID();
		const now = Date.now();
		const duration = opts?.duration !== undefined ? opts.duration : DEFAULT_DURATIONS[severity];

		setToasts((prev) => {
			const existing = prev.find(
				(t) =>
					t.severity === severity && t.message === message && now - t.createdAt < DEDUP_WINDOW_MS,
			);
			if (existing) {
				return prev.map((t) => (t.id === existing.id ? { ...t, count: t.count + 1 } : t));
			}
			const newToast: ToastItem = {
				id,
				severity,
				message,
				details: opts?.details,
				duration,
				count: 1,
				createdAt: now,
			};
			if (prev.length >= MAX_VISIBLE) {
				queueRef.current = [...queueRef.current, newToast];
				return prev;
			}
			return [...prev, newToast];
		});

		return id;
	}

	function update(id: string, opts: UpdateOptions) {
		setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...opts } : t)));
	}

	function dismiss(id: string) {
		setToasts((prev) => {
			const next = prev.filter((t) => t.id !== id);
			if (queueRef.current.length > 0 && next.length < MAX_VISIBLE) {
				const [queued, ...remaining] = queueRef.current;
				queueRef.current = remaining;
				return [...next, queued];
			}
			return next;
		});
	}

	function dismissAll() {
		queueRef.current = [];
		setToasts([]);
	}

	function openDetails(content: ReactNode | string) {
		setDetailsContent(content);
		setDetailsOpen(true);
	}

	function closeDetails() {
		setDetailsOpen(false);
	}

	return (
		<ToastContext
			value={{
				toasts,
				add,
				update,
				dismiss,
				dismissAll,
				detailsContent,
				detailsOpen,
				openDetails,
				closeDetails,
			}}
		>
			{children}
			<Toaster />
		</ToastContext>
	);
}
