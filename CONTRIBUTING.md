# Contributing to decree-ui

Thank you for your interest in contributing! This guide covers everything you need to get started.

> **Alpha status** — APIs, UI, and behavior are subject to change without notice. Breaking changes may happen between any two commits during this phase.

## Prerequisites

- **Node.js v22** or later
- A running [OpenDecree server](https://github.com/opendecree/decree) on `localhost:8080` for local development

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (proxies /v1/* to localhost:8080)
npm run dev
```

The app is available at `http://localhost:5173`.

## Running checks

```bash
npm run lint        # Biome lint
npm run typecheck   # TypeScript type check
npm test            # Vitest unit tests
npm run build       # Production build (also type-checks)
npm run pre-commit  # All of the above + build, in sequence
```

Run `npm run pre-commit` before every commit. CI runs the same pipeline.

## Code style

[Biome](https://biomejs.dev/) enforces formatting and lint rules. Auto-fix with:

```bash
npx biome check --write src/
```

No Prettier, no ESLint — Biome only.

## Submitting changes

1. Fork the repo and create a feature branch off `main`.
2. Make your changes.
3. Run `npm run pre-commit` and fix any failures.
4. Open a pull request against `main` with a clear description of what changed and why.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`.

## Reporting issues

Use [GitHub Issues](https://github.com/opendecree/decree-ui/issues). For security issues, see [SECURITY.md](SECURITY.md).
