import { Outlet } from "react-router-dom";
import { config } from "../lib/config";
import { label } from "../lib/labels";
import { AuthBar } from "./AuthBar";
import { DarkModeToggle } from "./DarkModeToggle";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Minimal chrome for `config-only` mode — a single tokenized topbar with the
 * brand, no rail. The deepest deployment-pin collapse: a pinned tenant's config
 * presented as a product-style settings page.
 */
export function ConfigOnlyLayout() {
	const appName = config.appName || label("app.name");
	const logoSrc = config.logoUrl || "/logo.svg";

	return (
		<div className="flex h-screen flex-col bg-canvas text-fg">
			<header className="flex min-h-14 items-center gap-3 border-b border-line bg-surface px-6 py-2.5">
				<img src={logoSrc} alt={appName} className="block h-8 w-auto max-w-42 object-contain" />
				<span className="text-base font-semibold">{appName}</span>
				{!import.meta.env.VITE_HIDE_DEBUG && <AuthBar />}
				<DarkModeToggle className="ml-auto" />
			</header>
			<main className="flex-1 overflow-auto bg-canvas p-6">
				<ErrorBoundary>
					<Outlet />
				</ErrorBoundary>
			</main>
		</div>
	);
}
