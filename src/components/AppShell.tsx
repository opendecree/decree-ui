import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { config } from "../lib/config";
import { label } from "../lib/labels";
import { buildRail, type NavItem, type RailModel } from "../lib/nav";
import { theme } from "../lib/theme";
import { AuthBar } from "./AuthBar";
import { DarkModeToggle } from "./DarkModeToggle";
import { ErrorBoundary } from "./ErrorBoundary";

/** Hamburger / close glyph for the mobile rail toggle. */
const ICON_MENU = (
	<svg
		aria-hidden="true"
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.5"
		strokeLinecap="round"
		className="h-5 w-5"
	>
		<title>Menu</title>
		<path d="M2 4h12M2 8h12M2 12h12" />
	</svg>
);

/** Initials for a scope avatar — first two chars of the tenant id, uppercased. */
function scopeInitials(tenantId: string | undefined): string {
	if (!tenantId) return "?";
	const cleaned = tenantId.replace(/[^a-zA-Z0-9]/g, "");
	return cleaned.slice(0, 2).toUpperCase() || "?";
}

/**
 * Role-first application shell: a tokenized left rail (brand + scope + grouped
 * nav + footer) and a topbar (role pill, theme toggle, debug auth bar). The rail's
 * contents are derived from the caller's role via `buildRail` — there is no shared
 * resource-tree nav. Built on the design tokens (surface / line / fg / accent),
 * replacing the previous gray chrome.
 */
export function AppShell() {
	const { auth } = useAuth();
	const [railOpen, setRailOpen] = useState(false);

	const rail: RailModel = buildRail(auth.role, { tenantId: auth.tenantId });
	const appName = config.appName || label("app.name");
	const logoSrc = config.logoUrl || "/logo.svg";

	const scopeKey = rail.scope === "global" ? "scope.scope" : "scope.tenant";
	const scopeValue =
		rail.scope === "global" ? label("scope.allTenants") : auth.tenantId || label("scope.noTenant");
	const scopeAvatar = rail.scope === "global" ? "∗" : scopeInitials(auth.tenantId);

	const closeRail = () => setRailOpen(false);

	return (
		<div className="grid h-screen grid-cols-1 overflow-hidden bg-canvas text-fg md:grid-cols-[232px_1fr]">
			{/* Mobile backdrop */}
			{railOpen && (
				<button
					type="button"
					aria-label="Close navigation"
					className="fixed inset-0 z-30 bg-black/40 md:hidden"
					onClick={closeRail}
				/>
			)}

			{/* Rail */}
			<aside
				className={`fixed inset-y-0 left-0 z-40 flex w-58 min-h-0 flex-col border-r border-line bg-surface transition-transform duration-200 md:static md:w-auto md:translate-x-0 md:transition-none ${
					railOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Brand */}
				<div className="flex items-center gap-2.5 px-4 pt-4 pb-3.5">
					<img
						src={logoSrc}
						alt={appName}
						className="block h-11 w-auto max-w-42 rounded-md object-contain"
					/>
					<div className="text-[15px] font-semibold leading-tight tracking-tight">
						{appName}
						<small className="block font-mono text-[9.5px] font-normal tracking-normal text-fg-3">
							{label("brand.tagline")}
						</small>
					</div>
				</div>

				{/* Scope context */}
				<div className="mx-3 mt-1 mb-1.5 flex items-center gap-2.5 rounded-md border border-line bg-surface-2 px-2.5 py-2">
					<span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-sm border border-line-2 bg-surface-3 font-mono text-[10px] text-fg-2">
						{scopeAvatar}
					</span>
					<div className="min-w-0">
						<div className="font-mono text-[9px] uppercase tracking-wider text-fg-3">
							{label(scopeKey)}
						</div>
						<div className="truncate font-semibold text-sm">{scopeValue}</div>
					</div>
				</div>

				{/* Grouped nav */}
				<nav className="flex flex-col gap-0.5 overflow-y-auto px-3 py-2">
					{rail.sections.map((section) => (
						<div key={section.groupKey ?? "top"} className="contents">
							{section.groupKey && (
								<div className="px-2 pt-3 pb-1 font-mono text-[9px] uppercase tracking-widest text-fg-3">
									{label(section.groupKey)}
								</div>
							)}
							{section.items.map((item) => (
								<RailLink key={`${item.to}:${item.labelKey}`} item={item} onClick={closeRail} />
							))}
						</div>
					))}
				</nav>

				{/* Footer */}
				<RailFooter />
			</aside>

			{/* Main column */}
			<div className="flex min-h-0 min-w-0 flex-col">
				{/* Topbar */}
				<header className="flex min-h-14 flex-none items-center gap-2.5 border-b border-line bg-surface px-4 py-2.5">
					<button
						type="button"
						onClick={() => setRailOpen((o) => !o)}
						className="grid h-8 w-8 place-items-center rounded-sm text-fg-2 hover:bg-surface-2 hover:text-fg md:hidden"
						aria-label="Toggle navigation"
					>
						{ICON_MENU}
					</button>
					{!import.meta.env.VITE_HIDE_DEBUG && <AuthBar />}
					<span className="flex-1" />
					<span className="rounded-sm border border-line-2 bg-surface-3 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-2">
						{auth.role}
					</span>
					<DarkModeToggle />
				</header>

				{/* Content */}
				<main className="flex-1 min-h-0 overflow-auto bg-canvas p-6">
					<ErrorBoundary>
						<Outlet />
					</ErrorBoundary>
				</main>
			</div>
		</div>
	);
}

function RailLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
	return (
		<NavLink
			to={item.to}
			end={item.end}
			onClick={onClick}
			className={({ isActive }) =>
				`flex items-center gap-2.5 rounded-sm border px-2.5 py-1.5 text-[13.5px] ${
					isActive
						? "border-accent-line bg-accent-soft text-fg"
						: "border-transparent text-fg-2 hover:bg-surface-2 hover:text-fg"
				}`
			}
		>
			{label(item.labelKey)}
		</NavLink>
	);
}

/** Rail footer — version line + the server feature flags (struck-through when off). */
function RailFooter() {
	const features = theme().features;
	const flags: Array<{ key: keyof typeof features; label: string }> = [
		{ key: "schemas", label: "schema" },
		{ key: "configVersions", label: "config" },
		{ key: "audit", label: "audit" },
		{ key: "fieldLocks", label: "locks" },
	];
	return (
		<div className="mt-auto border-t border-line px-4 py-3 font-mono text-[10px] leading-relaxed text-fg-3">
			<a
				href="https://github.com/opendecree/decree"
				target="_blank"
				rel="noopener noreferrer"
				className="hover:text-fg-2 hover:underline"
			>
				decree v{__APP_VERSION__}
			</a>
			<span className="mt-1 flex flex-wrap gap-1">
				{flags.map((flag) => (
					<span
						key={flag.key}
						className={`rounded-xs border border-line bg-surface-2 px-1.5 ${
							features[flag.key] ? "" : "line-through opacity-40"
						}`}
					>
						{flag.label}
					</span>
				))}
			</span>
		</div>
	);
}
