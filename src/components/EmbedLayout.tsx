import { Outlet } from "react-router-dom";

/** Minimal layout for iframe embedding — no sidebar, no header. */
export function EmbedLayout() {
	return (
		<main className="h-screen overflow-auto p-4">
			<Outlet />
		</main>
	);
}
