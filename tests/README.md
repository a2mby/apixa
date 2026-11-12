# Tests

Root home for the Apixa automated suites: Core, Mocking, React, the public facade and the AI
configuration tooling.

## Run

From the repo root:

```bash
pnpm test        # AI configuration tests, then the Vitest suite
pnpm typecheck   # package typechecks + tests/tsconfig consumer checks
pnpm verify      # build, architecture, API, typecheck, tests, packed consumers, browser, Edge
```

## Layout

- `tests/core/*.test.ts` — Core behavior: definitions, builtins, selection/classification,
  configuration merge, URLs/headers/transforms, the client-scoped mock engine, HTTP security,
  retry/timeout, middleware, idempotency, files/multipart, downloads, limits, transfer progress,
  streams, mock storage/fixtures/atomicity, advanced transfers, redirect security and
  compile-time contracts.
- `tests/mocking/*.test.ts` — dataset catalog and lazy loading, Node filesystem loaders, path
  containment, and the standalone `defineMockApi()` adapter on the shared engine.
- `tests/react/*.test.tsx` — resource queries, cache helpers/controllers, infinite queries,
  mutations, optimistic layers, SSR/request isolation, framework files and hook types.
- `tests/internal-shared/*.test.ts` — framework-neutral resource keys and operation classification.
- `tests/facade/*` — public entry exports, curated root list, declarations and packed-artifact
  contracts (see `public-exports.snapshot.json`).
- `tests/architecture/*` — repository boundary checks used by `pnpm check:architecture`.
- `tests/ai/*.test.mjs` — the `.ai` sync engine, filesystem safety and migration fixtures.
- `tests/helpers/` — fake `Transport`, type helpers and shared test utilities.
- `tests/tsconfig.json` — typecheck project for compile-time contracts.

Tests import packages and inject transports. They do not require the network or a live HTTP server.
Packed-consumer checks live in `scripts/` (`pnpm verify:consumers`, `verify:browser`, `verify:edge`).

The active milestone is [v1.8.1](../versions/v1.8.1/) (environment only). SDK behavior is frozen
through v1.8.0; see [versions/README.md](../versions/README.md) for status.
