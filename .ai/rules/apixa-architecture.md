---
description: Package ownership, import rules and verification for Apixa
globs: packages/**/*,scripts/**/*,docs/architecture.md,docs/public-api.md
alwaysApply: false
---

# Architecture ownership

Source of truth: `docs/architecture.md` (contract), `docs/public-api.md` (exports + migration map),
`docs/decisions/005-*.md` (why). Do not restate them elsewhere.

## Where code goes

| Feature                                                        | Package                           |
| -------------------------------------------------------------- | --------------------------------- |
| Definitions, operations, request lifecycle, errors, types      | `packages/core`                   |
| Datasets, `defineMockApi`, dataset loading, Node utilities     | `packages/mocking`                |
| Framework-neutral algorithm reused by integrations (Core only) | `packages/internal/shared`        |
| Hooks, `QueryClient`/TanStack logic, provider, hydration       | `packages/react` (`@apixa/react`) |
| Entry points that only re-export                               | the `apixa` facade (`src/`)       |

## May import

- core: nothing. mocking: core (`node:*` only inside `node.ts`'s closure). shared: core only.
- react: core, shared, `react`, `@tanstack/react-query`. Never mocking. `src/advanced.ts` never reaches `react`.
- facade (`src/`): only `export … from` the private implementation modules; `src/react/index.ts` lists names
  explicitly and must equal `@apixa/react`'s exports. Compile canonical sources into the single `apixa` distribution; leave framework peers external.
- Never import another package's `src/`; use its package name and an `exports` subpath.
- All implementation workspaces are private. Cross-workspace source dependencies are
  `devDependencies`; public root uses build aliases and has no private dependencies.
- Shared code never imports a framework. Keep `@apixa/internal-shared` a
  `devDependency`, never a `dependency`/`peerDependency`, never `export *` it from a public entry.
- Do not add Vue, Angular, or other framework packages until a version scope says so.

## Must stay compatible

Public symbols and import paths in `docs/public-api.md` (curated root list:
`tests/facade/curated-root-exports.json`); hook signatures; error text; declaration shapes. Record any path or symbol change in `docs/public-api.md` and `docs/story.md`.

## Run before finishing

`pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck && pnpm test && pnpm verify:consumers && pnpm verify:browser && pnpm verify:edge`
(`pnpm verify` runs all of it: packed tarballs in clean projects, real Chromium against the Next example,
workerd and the Vercel Edge Runtime). After a deliberate public export change run
`node scripts/verify-public-api.mjs --update` and review `tests/facade/public-exports.snapshot.json`.
`pnpm verify:publish` is read-only (npm account, root package permission, single-tarball dry-run) and never publishes.
Run `graphify update .` after code changes. Update the package table in
`scripts/check-architecture.mjs` when a package is added or renamed.

## Generated / do not hand-edit

`AGENTS.md` (from `.ai/rules/*.md` via `pnpm ai:sync`), `dist/`, `graphify-out/`,
`tests/facade/public-exports.snapshot.json` (via `--update`),
`pnpm-lock.yaml`, `packages/*/dist`. Frozen: `versions/vX.Y.Z/` of shipped versions (factual fixes only).
