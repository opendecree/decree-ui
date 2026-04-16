# UI Modes & Personas

The decree-ui is designed to be pluggable and customizable. The same codebase serves different users, deployment contexts, and use cases by composing building blocks according to the active mode.

## Personas

| Persona | Role | Cares about | Doesn't care about |
|---------|------|-------------|-------------------|
| **Platform Engineer** | superadmin | Schemas, field definitions, constraints, tenants, audit, system health | Pretty config editing UX |
| **Tenant Admin** | admin | Config values for their tenant, history, rollback | Schemas, other tenants, field types |
| **App Operator** | user | Reading current config, checking recent changes | Editing, schema management |
| **Demo Visitor** | admin | Seeing OpenDecree in action, editing values and watching live updates | System internals |

## Layout Modes

### `full` (default)

**Who:** Platform engineers managing the entire system.

**What's visible:**
- Full sidebar: Home → Schemas → Tenants → per-tenant Config/History/Audit
- Schema management: create, version, publish, import/export
- Tenant management: create, assign schema, update version
- Config editing with full audit trail
- Debug auth bar (subject, role, tenant selector)

**Navigation:** Home → Schema list → Schema detail → Tenant list → Tenant detail (config)

### `single-tenant`

**Who:** Tenant admins managing config for one specific tenant.

**What's visible:**
- Sidebar: Config, History, Audit Log, Usage (no schema/tenant navigation)
- Config editor for the pre-selected tenant
- History and rollback
- No schema management, no tenant list
- No "Back to tenants" breadcrumb

**Hidden:** Home page, schema list, tenant list, tenant creation, schema import

**Configuration:**
```
LAYOUT_MODE=single-tenant
TENANT_ID=demo-company
DEFAULT_ROLE=admin
```

### `single-schema`

**Who:** Platform engineers managing one schema with multiple tenants.

**What's visible:**
- Sidebar: Schema detail, Tenant list, per-tenant config
- Schema versioning, field management
- Tenant list filtered to this schema
- No schema list (only one schema)

**Configuration:**
```
LAYOUT_MODE=single-schema
SCHEMA_ID=payroll-service
```

### `config-only` (planned — #11)

**Who:** Non-technical admins who think of this as "settings."

**What's visible:**
- Config editor only — the landing page IS the config
- Edit values, see descriptions
- No sidebar navigation, no history, no audit
- No technical concepts (schema, tenant, version)
- Looks like a product settings page

**Hidden:** Everything except the config editor. History/audit accessible via subtle links if needed.

**Configuration:**
```
LAYOUT_MODE=config-only
TENANT_ID=demo-company
DEFAULT_ROLE=admin
```

### `embed` (planned)

**Who:** Other apps embedding decree config editing in an iframe.

**What's visible:**
- Config editor only, no chrome (no header, no sidebar, no debug bar)
- Communicates with parent frame via postMessage
- Auth passed via query params or postMessage

**Configuration:**
```
LAYOUT_MODE=embed
TENANT_ID=<uuid-or-slug>
```

## Building Blocks

The UI is composed of reusable building blocks. Each layout mode selects which blocks to include.

### Chrome

| Block | full | single-tenant | single-schema | config-only | embed |
|-------|------|--------------|---------------|-------------|-------|
| Top bar (logo + debug) | ✓ | ✓ | ✓ | ✓ | — |
| Debug auth bar | ✓ | ✓ (locked) | ✓ | hideable | — |
| Sidebar | full nav | tenant nav | schema nav | — | — |
| Sidebar footer | ✓ | ✓ | ✓ | — | — |

### Pages

| Block | full | single-tenant | single-schema | config-only | embed |
|-------|------|--------------|---------------|-------------|-------|
| Home / dashboard | ✓ | — | — | — | — |
| Schema list | ✓ | — | — | — | — |
| Schema detail | ✓ | — | ✓ | — | — |
| Schema import | ✓ | — | ✓ | — | — |
| Tenant list | ✓ | — | ✓ | — | — |
| Tenant create | ✓ | — | ✓ | — | — |
| Config editor | ✓ | ✓ | ✓ | ✓ | ✓ |
| Config history | ✓ | ✓ | ✓ | link | — |
| Audit log | ✓ | ✓ | ✓ | — | — |
| Usage stats | ✓ | ✓ | ✓ | — | — |

### Config Editor Features

| Feature | full | single-tenant | config-only | embed |
|---------|------|--------------|-------------|-------|
| Edit values | ✓ | ✓ | ✓ | ✓ |
| Field descriptions | ✓ | prominent | prominent | prominent |
| Field paths | prominent | secondary | hidden | hidden |
| Type badges | ✓ | subtle | — | — |
| Lock indicators | ✓ | ✓ | ✓ | ✓ |
| Constraints display | ✓ | tooltip | tooltip | — |
| Version selector | ✓ | ✓ | — | — |
| Import/Export | ✓ | ✓ | — | — |
| Rollback | ✓ | ✓ | — | — |

## Sidebar Content by Mode

### full
```
Home
Schemas
  └ [schema-name]
      ├ Fields
      ├ Versions
      └ Tenants
          └ [tenant-name]
              ├ Config
              ├ History
              ├ Audit Log
              └ Usage
```

### single-tenant
```
Config          ← landing page
History
Audit Log
Usage
---
[footer: version, docs link, "Powered by OpenDecree"]
```

### single-schema
```
Schema
  ├ Fields
  └ Versions
Tenants
  └ [tenant-name]
      ├ Config
      └ History
---
[footer]
```

### config-only
```
[no sidebar — config editor is the full page]
```

## Theming

The UI supports dark/light mode toggle. Future considerations:
- Custom brand colors via CSS variables
- Logo customization via env var (URL to logo image)
- Custom page title via env var

## Debug Bar Behavior

| Mode | Debug bar |
|------|-----------|
| full | Visible, all controls editable |
| single-tenant | Visible but role/tenant locked to config values |
| config-only | Hidden by default, toggle via keyboard shortcut |
| embed | Never shown |

## Environment Variables Summary

| Variable | Purpose | Default |
|----------|---------|---------|
| `API_URL` | Backend URL for nginx proxy | `http://localhost:8080` |
| `BROWSER_API_URL` | Browser API URL (empty = same origin) | `""` |
| `LAYOUT_MODE` | UI mode | `full` |
| `TENANT_ID` | Pre-selected tenant (UUID or slug) | `""` |
| `SCHEMA_ID` | Pre-selected schema (UUID or slug) | `""` |
| `DEFAULT_ROLE` | Default auth role | `superadmin` |
| `DEFAULT_SUBJECT` | Default auth subject | `admin` |
