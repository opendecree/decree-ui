import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface Props {
	children: ReactNode;
	/** Custom fallback — defaults to the built-in error card. */
	fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
	error: Error | null;
}

/**
 * Catches render errors in its subtree. In development the component stack
 * is logged to the console via componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		if (import.meta.env.DEV) {
			console.error("[ErrorBoundary]", error, info.componentStack);
		}
	}

	reset = () => this.setState({ error: null });

	render() {
		const { error } = this.state;
		if (error) {
			if (this.props.fallback) {
				return this.props.fallback(error, this.reset);
			}
			return <ErrorFallback error={error} onRetry={this.reset} />;
		}
		return this.props.children;
	}
}

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
			<p className="text-lg font-semibold text-red-600 dark:text-red-400">Something went wrong</p>
			<p className="max-w-sm text-sm text-gray-600 dark:text-gray-400">{error.message}</p>
			<div className="flex gap-3">
				<button
					type="button"
					onClick={onRetry}
					className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
				>
					Retry
				</button>
				<button
					type="button"
					onClick={() => window.location.reload()}
					className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
				>
					Reload page
				</button>
			</div>
		</div>
	);
}
