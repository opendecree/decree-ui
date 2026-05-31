import { Outlet } from "react-router-dom";
import { config } from "../lib/config";
import { label } from "../lib/labels";
import { AuthBar } from "./AuthBar";
import { DarkModeToggle } from "./DarkModeToggle";
import { ErrorBoundary } from "./ErrorBoundary";

/** Minimal layout for config-only mode — header with app identity, no sidebar. */
export function ConfigOnlyLayout() {
	const appName = config.appName || label("app.name");
	const logoSrc = config.logoUrl || "/logo.svg";

	return (
		<div className="flex h-screen flex-col">
			<header className="flex items-center gap-3 border-b border-gray-200 px-6 py-3 dark:border-gray-800">
				<img src={logoSrc} alt="" className="h-8 w-8" />
				<span className="text-base font-semibold">{appName}</span>
				{!import.meta.env.VITE_HIDE_DEBUG && <AuthBar />}
				<DarkModeToggle className="ml-auto" />
			</header>
			<main className="flex-1 overflow-auto p-6">
				<ErrorBoundary>
					<Outlet />
				</ErrorBoundary>
			</main>
		</div>
	);
}
