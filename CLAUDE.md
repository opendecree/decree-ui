# OpenDecree UI — Claude Context

## Overview

Admin GUI for the OpenDecree configuration service. Schema browser, config editor, tenant
management, and audit log. Speaks to the decree server via a REST gateway (OpenAPI-generated
types + `openapi-fetch`).

## Tech Stack

| Concern | Tool |
|---------|------|
| Language | TypeScript |
| Framework | React 19 |
| Build | Vite |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query + openapi-fetch |
| Routing | React Router |
| Lint / format | Biome |
| Unit tests | Vitest + React Testing Library |
| E2E tests | Playwright |
| API types | openapi-typescript (generated from OpenAPI spec) |

## Development

### Prerequisites

Node.js 22+, Docker (for E2E stack), npm.

### Key Commands

```bash
npm run dev            # Vite dev server
npm run generate       # regenerate API types from openapi.json
npm run pre-commit     # biome check + typecheck + unit tests + build
npm run test           # vitest run (unit)
npm run test:e2e       # playwright test (requires Docker Compose stack)
npm run build          # production build → dist/
```

### Layout

```
src/
├── api/          # generated OpenAPI types + fetch client
├── components/   # shared UI components
├── pages/        # route-level components
└── ...
```

## Coding Guidelines

See [coding-guidelines.md](https://github.com/opendecree/decree/blob/main/docs/development/coding-guidelines.md)
for the shared philosophy (vanilla principle, minimal deps) and the UI-specific section
(no component library, accessible markup, Biome, Vite + React + Tailwind stack).

## Conventions

- No component library — build from HTML + Tailwind utilities
- API types generated from `openapi.json` via `openapi-typescript`; committed under `src/api/schema.d.ts`
- Semantic HTML + ARIA for accessibility
- Apache 2.0 license
