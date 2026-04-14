import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { config } from "../lib/config";
import { label } from "../lib/labels";
import { canManageSchemas, canManageTenants } from "../lib/permissions";
import { AuthBar } from "./AuthBar";
import { DarkModeToggle } from "./DarkModeToggle";

/** App shell with sidebar navigation, header, and content area. */
export function Layout() {
	const { auth } = useAuth();

	const isSuperadmin = auth.role === "superadmin";
	const showSchemas = config.layoutMode === "full" && canManageSchemas(auth.role);
	const showTenants =
		config.layoutMode !== "single-tenant" && (isSuperadmin || canManageTenants(auth.role));

	// Non-superadmin with a tenant set — show direct link to their tenant
	const hasTenantScope = !isSuperadmin && auth.tenantId;

	return (
		<div className="flex h-screen">
			{/* Sidebar */}
			<nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
				<div className="border-b border-gray-200 p-4 dark:border-gray-800">
					<h1 className="text-lg font-semibold">{label("app.name")}</h1>
				</div>
				<div className="flex flex-1 flex-col gap-1 p-3">
					<SidebarLink to="/" label={label("nav.home")} />
					{showSchemas && <SidebarLink to="/schemas" label={label("nav.schemas")} />}
					{showTenants && <SidebarLink to="/tenants" label={label("nav.tenants")} />}
					{hasTenantScope && (
						<SidebarLink to={`/tenants/${auth.tenantId}`} label={label("nav.myConfig")} />
					)}
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

function SidebarLink({ to, label }: { to: string; label: string }) {
	return (
		<NavLink
			to={to}
			end={to === "/"}
			className={({ isActive }) =>
				`rounded px-3 py-2 text-sm ${
					isActive
						? "bg-gray-200 font-medium dark:bg-gray-800"
						: "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
				}`
			}
		>
			{label}
		</NavLink>
	);
}
