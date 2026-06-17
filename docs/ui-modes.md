# UI Modes, Roles & Deployment Pins

> **Status: alpha.** OpenDecree is pre-1.0; the IA, config keys, and screens
> described here are subject to change.

The decree-ui is organized around a single primary axis: **role**. Who you are
(superadmin / admin / user) determines where you land and what navigation you
see. On top of that, a deployment narrows the experience with a small set of
**pins** (`layoutMode`, `tenantId`, `schemaId`, `defaultRole`) injected at
runtime. Role decides the *shape*; pins decide the *scope*.

This replaces the older "resource-tree" model (Schemas → Tenants → Config driven
by `layoutMode` alone). `layoutMode` still exists — it is one of the pins — but it
is no longer the primary organizing concept.

## Role is the entry axis

Every session resolves an **entry destination** from the caller's role. This is
implemented in `src/lib/nav.ts` (`resolveEntryPath`) and exercised by the app
shell (`src/components/AppShell.tsx`).

| Role | Lands on | Today's screen | Rail scope |
|------|----------|----------------|------------|
| **superadmin** | System overview | `Home` (interim — overview is [#91]) | All tenants (global) |
| **admin** | Config editor for the pinned tenant | `TenantDetail` via `TenantConfig` | The pinned tenant |
| **user** | Read view for the pinned tenant | `ReadView` via `TenantConfig` | The pinned tenant |

Resolution rules:

- **user / admin** → `/tenants/:id` when a tenant is pinned, else the tenants
  list (`/tenants`) so they can pick one they're scoped to.
- **superadmin** → the cross-tenant **system overview**. That screen does not
  exist yet; until [#91] lands, superadmin falls through to `Home`. The fallthrough
  is marked `TODO(#91)` in `App.tsx` and `nav.ts`.

The route `/tenants/:id` always renders the **`TenantConfig` dispatcher**, which
picks the editor (`TenantDetail`) for roles that `canEditConfig` and the read view
(`ReadView`) for read-only roles — see `src/lib/permissions.ts`. Rendering one
component or the other (rather than branching inside one) keeps React hook order
stable when the active role changes via the debug auth bar.

### Why role-first

Role gating is the server's contract, not a UI nicety. The 3-layer guard chain
(`internal/authz`) is: **RolePolicyGuard** (action's minimum role) →
**TenantScopeGuard** (non-superadmins restricted to assigned tenants) →
**FieldLockGuard** (locked fields reject admin/user writes). So:

- **role** determines *which controls exist* — a `user` UI has no write
  affordances at all (absent, not disabled);
- **tenant scope** determines *which tenants appear* — a tenant switcher only
  makes sense for superadmin or a multi-tenant admin;
- **field locks** determine *which inputs are editable* within a config.

All UI role gating routes through `src/lib/permissions.ts`
(`canEditConfig` / `canManageSchemas` / `canManageTenants` / `canManageLocks`).
It is never re-derived inline.

## The rail, per role

The left rail (`AppShell`) is built from `buildRail(role, config)` in `nav.ts` —
a labelled, grouped set of nav links. There is no shared resource-tree nav.

### superadmin — the rare setup-time user

```
scope: ∗ All tenants
operate
  System overview        (TODO #91 — Home today)
author
  Tenants
  Schemas
```

Only superadmin sees schema authoring and tenant lifecycle (create / delete) —
for admin and user, schemas are invisible infrastructure.

### admin — one tenant's config owner

```
scope: <tenant>
my tenant
  Config editor
  History
govern
  Audit log
  Usage
```

admin can also lock/unlock fields (a `write`, not superadmin-only), but cannot
write a locked field.

### user — read-only operator

```
scope: <tenant>
read
  Values
  History
govern
  Audit log
  Usage
```

## Deployment pins (the runtime config surface)

The UI is configured at runtime, not just rebuilt. The Docker entrypoint
(`deploy/docker-entrypoint.sh`) writes `window.__DECREE_UI_CONFIG__`, read by
`src/lib/config.ts`. Runtime (Docker) values take precedence over build-time
(`VITE_*`) values.

| config key | Docker env | Vite env | Purpose | Pin role |
|---|---|---|---|---|
| `apiUrl` | `BROWSER_API_URL` | `VITE_API_URL` | API base (empty = same origin via nginx) | backend wiring |
| `layoutMode` | `LAYOUT_MODE` (def `full`) | `VITE_LAYOUT_MODE` | `full` / `single-schema` / `single-tenant` / `config-only` | **collapse shape** |
| `tenantId` | `TENANT_ID` (or `_FILE`) | `VITE_TENANT_ID` | pre-selected tenant | **tenant pin** |
| `schemaId` | `SCHEMA_ID` (or `_FILE`) | `VITE_SCHEMA_ID` | pre-selected schema | **schema pin** |
| `defaultRole` | `DEFAULT_ROLE` | `VITE_DEFAULT_ROLE` | role in auth header (**empty = superadmin**) | **role pin** |
| `defaultSubject` | `DEFAULT_SUBJECT` | `VITE_DEFAULT_SUBJECT` | subject in auth header (empty = `admin`) | identity |
| `logoUrl` | `LOGO_URL` | `VITE_LOGO_URL` | white-label logo (empty = default mark) | brand chrome |
| `appName` | `APP_NAME` | `VITE_APP_NAME` | white-label name (empty = `labels.json`) | brand chrome |
| — | — | `VITE_HIDE_DEBUG` | hide the debug auth bar | chrome |

Plus the UI `Theme` (`src/lib/theme.ts`): `appName`, `logoUrl`, and
`features { schemas, audit, configVersions, fieldLocks, configImportExport }` —
feature toggles that gate which sections/nav render (the rail footer shows them,
struck-through when off), complementing the server's `GetServerInfo` feature map.

**Dependency to preserve:** a pinned tenant implies a pinned schema (a tenant
binds exactly one published schema version). So `tenantId` set ⇒ schema is
determined; "tenant pinned + schema free" is incoherent.

### `defaultRole` — the role pin

Pinning `defaultRole` locks the deployment to one role's experience. Empty =
superadmin (the full system view). This is the concrete mechanism behind
"role = entry point": set it, and entry routing + the rail collapse to that role.

In `config-only`, superadmin is not offered (it would expose schema/tenant
authoring on a settings-style page); a stored or pinned superadmin role is capped
to `admin` (`src/lib/auth.ts`).

## `layoutMode` — the collapse shapes

`layoutMode` is a pin that picks how much chrome and breadth the deployment
exposes. It is **not** the role axis — the same `full` deployment serves all three
roles via role-first entry.

| `layoutMode` | Who it's for | Chrome | Pins typically set |
|---|---|---|---|
| `full` (default) | A multi-everything deployment; superadmin sees the whole system, admin/user are scoped by role | App shell (rail + topbar) | — |
| `single-schema` | One schema, many tenants | App shell | `schemaId` |
| `single-tenant` | One tenant, full chrome | App shell | `tenantId`, usually `defaultRole=admin` |
| `config-only` | Non-technical admins; config presented as a product "settings" page | Topbar only, no rail | `tenantId`, `defaultRole=admin` |

> **`embed` is a route, not a `layoutMode`.** Earlier drafts listed a fifth mode,
> `embed`. In the code, `LayoutMode = "full" | "single-schema" | "single-tenant"
> | "config-only"` — there is no `embed` member. Embedding is served by the
> `/embed/*` **routes** (`src/components/EmbedLayout.tsx`): chrome-free pages for
> iframe hosts, available regardless of `layoutMode`. The reconciliation: the
> first four are collapse *shapes* selected by a config key; embedding is a
> *delivery surface* selected by URL. Both `config-only` and `embed` render the
> same `TenantConfig` role dispatcher, so role-first behavior holds there too.

## Chrome building blocks

| Block | full / single-* | config-only | embed (route) |
|-------|-----------------|-------------|---------------|
| Tokenized rail (brand + scope + role nav + footer) | ✓ | — | — |
| Topbar (role pill, theme toggle) | ✓ | ✓ | — |
| Debug auth bar | ✓ (hideable) | hideable | — |

All chrome is built on the design tokens in `src/index.css` (`bg-canvas`,
`bg-surface`, `text-fg`, `border-line`, `text-accent`, `bg-accent-soft`, the
semantic `ok`/`warn`/`danger`/`lock` colors, and `font-mono`). Light is the
default; dark is the `.dark` class on `<html>`.

## Theming

- Light (default) + dark (`.dark` on `<html>`), toggled in the topbar and
  persisted to `localStorage`.
- White-label brand via `logoUrl` + `appName`.
- Section gating via `features` (and the server's `GetServerInfo` feature map).

## Debug auth bar behavior

The debug auth bar (`src/components/AuthBar.tsx`) sets the dev-mode metadata
headers (subject / role / tenant). It is for non-JWT deployments and local dev.

| Mode | Debug bar |
|------|-----------|
| `full` / `single-*` | Visible; switch role/subject/tenant freely |
| `config-only` | Visible unless hidden; superadmin excluded from the role list |
| `embed` route | Never shown |

Set `VITE_HIDE_DEBUG` to suppress it.

## File-based ID injection

`TENANT_ID_FILE` / `SCHEMA_ID_FILE` allow file-based injection (k8s secrets /
configmaps, or a seed container) as a fallback when the env var is empty. The env
var always wins.

```yaml
admin:
  environment:
    LAYOUT_MODE: config-only
    TENANT_ID_FILE: /data/tenant-id
    DEFAULT_ROLE: admin
  volumes:
    - seed-data:/data:ro
```

For real deployments, set the value directly:

```yaml
admin:
  environment:
    LAYOUT_MODE: config-only
    TENANT_ID: <uuid>
    DEFAULT_ROLE: admin
```
