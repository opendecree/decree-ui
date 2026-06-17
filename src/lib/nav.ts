/**
 * Role-first information architecture.
 *
 * Role is the primary entry axis: where a session lands and which navigation it
 * sees are both derived from the caller's role, not from a resource tree. The
 * deployment pins (`layoutMode`, `tenantId`, `schemaId`, `defaultRole`) layer on
 * top — they constrain *which* tenant/schema is in scope and which role the
 * deployment defaults to, but the shape of each role's experience is fixed here.
 *
 * Keeping this pure (no React, no DOM) makes the role -> entry contract directly
 * unit-testable, which is the backbone of the app shell's routing.
 */

import type { Role } from "./constants";
import { canManageSchemas, canManageTenants } from "./permissions";

/** The subset of runtime config that drives navigation + entry routing. */
export interface NavConfig {
	tenantId?: string;
}

/**
 * Where a freshly-authenticated session of this role should land.
 *
 *  - `user`       -> the read view of the pinned tenant (`/tenants/:id`, dispatched
 *                    to ReadView). With no pinned tenant there is nothing to read,
 *                    so fall back to the tenants list.
 *  - `admin`      -> the config editor for the pinned tenant (`/tenants/:id`,
 *                    dispatched to TenantDetail). Unpinned admins pick from the
 *                    tenants list.
 *  - `superadmin` -> the system overview. That screen does not exist yet
 *                    (TODO(#91)); until then, the current best landing is Home.
 */
export function resolveEntryPath(role: Role, config: NavConfig): string {
	switch (role) {
		case "user":
		case "admin":
			return config.tenantId ? `/tenants/${config.tenantId}` : "/tenants";
		default:
			// TODO(#91): superadmin overview entry — route here once the
			// system-overview screen lands. Home is the interim landing.
			return "/";
	}
}

/** A single rail link. `count` is an optional trailing badge (e.g. version, "live"). */
export interface NavItem {
	to: string;
	labelKey: string;
	/** Match the route exactly (used for index-style links like the tenant root). */
	end?: boolean;
}

/** A labelled cluster of rail links (e.g. "operate", "govern"). */
export interface NavSection {
	/** Label key for the group heading; omit for an unlabelled top cluster. */
	groupKey?: string;
	items: NavItem[];
}

/** Whether the rail shows a tenant context (admin/user) or a global scope (superadmin). */
export type ScopeKind = "tenant" | "global";

/** The full rail model for a role: scope chip + grouped nav. Derived, never inline. */
export interface RailModel {
	scope: ScopeKind;
	sections: NavSection[];
}

/**
 * Build the rail model for a role + scope. Capability gating routes through
 * `permissions.ts` (e.g. only schema/tenant managers get the authoring group) so
 * role logic is never duplicated here.
 */
export function buildRail(role: Role, config: NavConfig): RailModel {
	if (role === "superadmin") {
		const author: NavItem[] = [];
		if (canManageTenants(role)) {
			author.push({ to: "/tenants", labelKey: "nav.tenants" });
		}
		if (canManageSchemas(role)) {
			author.push({ to: "/schemas", labelKey: "nav.schemas" });
		}
		return {
			scope: "global",
			sections: [
				{
					groupKey: "navGroup.operate",
					items: [{ to: "/", labelKey: "nav.overview", end: true }],
				},
				{ groupKey: "navGroup.author", items: author },
			],
		};
	}

	// admin + user are tenant-scoped. Their primary action differs (edit vs read),
	// the govern group (audit/usage/schema reference) is shared.
	const tenantBase = config.tenantId ? `/tenants/${config.tenantId}` : "/tenants";
	const primary: NavItem =
		role === "admin"
			? { to: tenantBase, labelKey: "nav.configEditor", end: true }
			: { to: tenantBase, labelKey: "nav.values", end: true };
	const primaryGroupKey = role === "admin" ? "navGroup.myTenant" : "navGroup.read";

	const govern: NavItem[] = [];
	if (config.tenantId) {
		govern.push({ to: `${tenantBase}/audit`, labelKey: "nav.auditLog" });
		govern.push({ to: `${tenantBase}/usage`, labelKey: "nav.usage" });
	}

	const sections: NavSection[] = [{ groupKey: primaryGroupKey, items: [primary] }];
	if (config.tenantId) {
		sections[0].items.push({ to: `${tenantBase}/history`, labelKey: "nav.history" });
	}
	if (govern.length > 0) {
		sections.push({ groupKey: "navGroup.govern", items: govern });
	}
	return { scope: "tenant", sections };
}
