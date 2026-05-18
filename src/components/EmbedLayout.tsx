import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";

/** Minimal layout for iframe embedding — no sidebar, no header. */
export function EmbedLayout() {
	return (
		<main className="h-screen overflow-auto p-4">
			<ErrorBoundary>
				<Outlet />
			</ErrorBoundary>
		</main>
	);
}
