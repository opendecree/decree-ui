import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Minimal chrome for iframe embedding — no rail, no topbar, just the content on
 * the design canvas. `embed` is a route (not a layoutMode); the host frame
 * supplies identity and scope.
 */
export function EmbedLayout() {
	return (
		<main className="h-screen overflow-auto bg-canvas p-4 text-fg">
			<ErrorBoundary>
				<Outlet />
			</ErrorBoundary>
		</main>
	);
}
