# v1.9.0 — Context

Frozen milestone context. Living direction: [`docs/context.md`](../../docs/context.md).

## Goal

Fix developer-experience problems and bugs in the library, found by using Apixa against real backends. Each item is a small, separately verifiable fix.

## Identity (this release)

- Core (and the `apixa` single-package surface that re-exports it); no new packages.
- Milestone number is not the npm version. The published package is `apixa@2.0.0`; this milestone does not bump or publish it.
- First item: **live pagination**. `pagination` shapes only types for live resources today, so a real paginated backend (for example Laravel's `{ data, links, meta }`) reaches the caller as a raw object typed as a different shape. The `examples/frontends/nextjs-products` example hit this.

## What success looks like

A live resource can declare how its backend paginates, once, and `getAll()` then returns apixa's page contract at runtime, matching its type. The default (no object) is the existing apixa shape, a preset covers common backends, and an object or function covers special cases. Further DX/bug items are added to this contract only when they are found and verified.

## Principles that bind this release

1. Core stays thin; no backend is hard-coded into Core. Presets are data, not behavior branches.
2. Opt-in: a resource without the new config behaves exactly as today. `pagination: "page" | "cursor"` keeps working unchanged.
3. Fields are declared, never guessed. No auto-detection; a missing mapped field is a `ParseError`, not `undefined`.
4. One contract for live and mocked resources (`{ data, total, page, pageSize }` / `{ data, nextCursor }`).
5. Every fix has a failing-first test and, where user-visible, an updated example or doc.

## Intentionally out

Schema validation hooks, new packages, auth/cache helpers, OpenAPI, new framework adapters, unrelated refactors. See [scope.md](./scope.md).
