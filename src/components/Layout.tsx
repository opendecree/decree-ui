import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { config } from "../lib/config";
import { label } from "../lib/labels";
import { canManageSchemas, canManageTenants } from "../lib/permissions";
import { AuthBar } from "./AuthBar";
import { DarkModeToggle } from "./DarkModeToggle";

// --- Sidebar icons (simple inline SVGs, 16x16) ---

const icons = {
	home: (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-4 w-4"
		>
			<path d="M2 6.5 8 2l6 4.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5Z" />
			<path d="M6 14V9h4v5" />
		</svg>
	),
	config: (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-4 w-4"
		>
			<circle cx="8" cy="8" r="2.5" />
			<path d="M13.3 10a1.1 1.1 0 0 0 .2 1.2l.04.04a1.33 1.33 0 1 1-1.89 1.89l-.03-.04a1.1 1.1 0 0 0-1.88.78v.11a1.33 1.33 0 1 1-2.67 0v-.06A1.1 1.1 0 0 0 6 12.72a1.1 1.1 0 0 0-1.21.2l-.04.04a1.33 1.33 0 1 1-1.89-1.89l.04-.03A1.1 1.1 0 0 0 3.1 10a1.1 1.1 0 0 0-.78-.66h-.11a1.33 1.33 0 1 1 0-2.67h.06A1.1 1.1 0 0 0 3.28 6a1.1 1.1 0 0 0-.2-1.21l-.04-.04a1.33 1.33 0 1 1 1.89-1.89l.03.04A1.1 1.1 0 0 0 6 3.1h.06V2a1.33 1.33 0 1 1 2.67 0v.06a1.1 1.1 0 0 0 .66 1.01 1.1 1.1 0 0 0 1.21-.2l.04-.04a1.33 1.33 0 1 1 1.89 1.89l-.04.03a1.1 1.1 0 0 0 .2 1.88V7h.02a1.33 1.33 0 1 1 0 2.67h-.06a1.1 1.1 0 0 0-1.01.66Z" />
		</svg>
	),
	history: (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-4 w-4"
		>
			<circle cx="8" cy="8" r="6" />
			<path d="M8 4.5V8l2.5 1.5" />
		</svg>
	),
	audit: (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-4 w-4"
		>
			<path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
			<path d="M6 5h4M6 8h4M6 11h2" />
		</svg>
	),
	usage: (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-4 w-4"
		>
			<path d="M2 14V9.5M5.5 14V7M9 14V4.5M12.5 14V2" />
		</svg>
	),
	schemas: (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-4 w-4"
		>
			<rect x="2" y="2" width="5" height="5" rx=".5" />
			<rect x="9" y="2" width="5" height="5" rx=".5" />
			<rect x="2" y="9" width="5" height="5" rx=".5" />
			<rect x="9" y="9" width="5" height="5" rx=".5" />
		</svg>
	),
	tenants: (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-4 w-4"
		>
			<circle cx="6" cy="5" r="2.5" />
			<path d="M1 13a5 5 0 0 1 10 0" />
			<path d="M10.5 4.5a2.5 2.5 0 1 1 0 3" />
			<path d="M12 13a5 5 0 0 0-2-4" />
		</svg>
	),
} as const;

/** App shell with sidebar navigation, header, and content area. */
export function Layout() {
	const { auth } = useAuth();

	const isSingleTenant = config.layoutMode === "single-tenant";
	const isSuperadmin = auth.role === "superadmin";
	const showSchemas = config.layoutMode === "full" && canManageSchemas(auth.role);
	const showTenants =
		config.layoutMode !== "single-tenant" && (isSuperadmin || canManageTenants(auth.role));

	const hasTenantScope = !isSuperadmin && auth.tenantId;
	const tenantPath = auth.tenantId ? `/tenants/${auth.tenantId}` : "/";

	const appName = config.appName || label("app.name");
	const logoSrc = config.logoUrl || "/logo.svg";

	return (
		<div className="flex h-screen">
			{/* Sidebar */}
			<nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
				<div className="flex items-center gap-2.5 border-b border-gray-200 p-4 dark:border-gray-800">
					<img src={logoSrc} alt="" className="h-12 w-12" />
					<h1 className="text-xl font-semibold">{appName}</h1>
				</div>
				<div className="flex flex-1 flex-col gap-1 p-3">
					{isSingleTenant ? (
						<>
							<SidebarLink to={tenantPath} icon={icons.config} label={label("nav.config")} end />
							<SidebarLink
								to={`${tenantPath}/history`}
								icon={icons.history}
								label={label("nav.history")}
							/>
							<SidebarLink
								to={`${tenantPath}/audit`}
								icon={icons.audit}
								label={label("nav.auditLog")}
							/>
							<SidebarLink
								to={`${tenantPath}/usage`}
								icon={icons.usage}
								label={label("nav.usage")}
							/>
						</>
					) : (
						<>
							<SidebarLink to="/" icon={icons.home} label={label("nav.home")} />
							{showSchemas && (
								<SidebarLink to="/schemas" icon={icons.schemas} label={label("nav.schemas")} />
							)}
							{showTenants && (
								<SidebarLink to="/tenants" icon={icons.tenants} label={label("nav.tenants")} />
							)}
							{hasTenantScope && (
								<SidebarLink
									to={`/tenants/${auth.tenantId}`}
									icon={icons.config}
									label={label("nav.myConfig")}
								/>
							)}
						</>
					)}
				</div>

				{/* Footer */}
				<div className="border-t border-gray-200 p-3 dark:border-gray-800">
					<p className="text-[11px] text-gray-400 dark:text-gray-600">
						Powered by{" "}
						<a
							href="https://github.com/opendecree/decree"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-gray-600 hover:underline dark:hover:text-gray-400"
						>
							OpenDecree
						</a>
					</p>
				</div>
			</nav>

			{/* Main area */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{/* Header */}
				<header className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
					<AuthBar />
					<DarkModeToggle />
				</header>

				{/* Content */}
				<main className="flex-1 overflow-auto p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}

function SidebarLink({
	to,
	icon,
	label,
	end,
}: {
	to: string;
	icon: ReactNode;
	label: string;
	end?: boolean;
}) {
	return (
		<NavLink
			to={to}
			end={end || to === "/"}
			className={({ isActive }) =>
				`flex items-center gap-2.5 rounded px-3 py-2 text-sm ${
					isActive
						? "bg-gray-200 font-medium dark:bg-gray-800"
						: "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
				}`
			}
		>
			{icon}
			{label}
		</NavLink>
	);
}
