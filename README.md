# OpenDecree Admin GUI

[![CI](https://github.com/opendecree/decree-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/opendecree/decree-ui/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/opendecree/decree-ui)](LICENSE)
[![Project Status: WIP](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)

Web-based admin interface for [OpenDecree](https://github.com/opendecree/decree) — schema-driven configuration management.

> **Alpha** — This project is under active development. UI, configuration, and behavior may change without notice between versions.

## Development

```bash
# Install dependencies
npm install

# Start dev server (proxies /v1/* to localhost:8080)
npm run dev

# Run checks
npm run lint
npm run typecheck
npm test
npm run build
```

Requires a running OpenDecree server at `localhost:8080` (REST gateway).

## Environment Variables

| Variable | Description | Default |
|----------|------------|---------|
| `VITE_API_URL` | API base URL | `""` (same origin) |
| `VITE_LAYOUT_MODE` | `full`, `single-schema`, or `single-tenant` | `full` |
| `VITE_TENANT_ID` | Pre-selected tenant (single-tenant mode) | — |
| `VITE_SCHEMA_ID` | Pre-selected schema (single-schema mode) | — |

## Customization

All user-facing text and feature flags are configurable via two JSON files. Edit them before building to white-label the UI.

### Labels (`config/labels.json`)

Every string shown in the UI — page titles, button text, navigation items, empty states — is defined in this file. Override any key to rename concepts for your domain:

```json
{
  "nav.tenants": "Services",
  "tenant.singular": "Service",
  "tenant.plural": "Services",
  "tenant.create": "Create Service",
  "app.name": "MyCompany Config"
}
```

Only include the keys you want to change — defaults are used for the rest.

### Theme (`config/theme.json`)

Structural configuration:

```json
{
  "appName": "MyCompany Config",
  "logoUrl": "/my-logo.svg",
  "features": {
    "schemas": true,
    "audit": true,
    "configVersions": true,
    "fieldLocks": true,
    "configImportExport": true
  }
}
```

Set `features.schemas` to `false` to hide schema management entirely (useful when embedding for non-admin users).

### Applying customizations

Edit the files in `config/`, then rebuild:

```bash
npm run build
```

No code changes needed — the config files are read at build time.

## Stack

React 19, Vite, React Router, TanStack Query, Tailwind CSS, Biome, Vitest.

API types auto-generated from the OpenAPI spec via `openapi-typescript`.

## Questions?

Head to [OpenDecree Discussions](https://github.com/orgs/opendecree/discussions) — our community hub covers all OpenDecree repos.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
