# 004 — Four public packages, one private shared integration layer

Status: accepted and **implemented**: private shared package, boundary checks, the `apixa` facade and
the `@apixa/react` package (formerly developed as `@apixa/tanstack-query`, never published).
Export contract: [public-api.md](../public-api.md).

## Context

The workspace has three packages (`core`, `mocking`, `tanstack-query`) and an uncommitted root
`apixa` bundle that builds from their sources. v1.0.0 needs one memorable install (`apixa`) while
keeping Core framework-independent and leaving room for further framework integrations. TanStack
Query is an implementation detail of the React integration, not a product name.

## Decision

1. Four independently publishable packages: `apixa` (facade), `@apixa/core`, `@apixa/mocking`,
   `@apixa/react` (today's `@apixa/tanstack-query`).
2. One private workspace package, `@apixa/internal-shared` (`packages/internal/shared/`), for
   framework-neutral integration algorithms. It is never published: consumers list it as a
   `devDependency`, their bundler inlines it, and `scripts/check-architecture.mjs` fails if a
   published tarball or declaration still names it.
3. Dependency direction is one-way: `core ← mocking`, `core ← internal-shared ← react`. Core
   imports no integration, no framework and no Node built-in. The facade only re-exports.
4. Only code that already exists and is already reusable moves into the shared layer. Today that is
   resource cache keys and operation classification. Query options, cache sync, optimistic layers,
   mutation stores and result composition stay in the React package because they are written
   against TanStack's `QueryClient`, observers and tracking proxy.
5. The boundaries are enforced by tooling (`pnpm check:architecture`), not by convention.

## Consequences

- A second framework integration can reuse keys and operation classification without copying them,
  and cannot accidentally import React because the shared package may import only Core.
- The shared layer is intentionally small. Moving more (for example invalidation policy) needs a
  second consumer to justify the abstraction.
- Publishing work (Phase 2) must keep inlining the shared layer; the rule above makes a missing
  inline a build-time failure rather than a consumer-time `ERR_MODULE_NOT_FOUND`.
- One user-visible string, the `full: true` error, still says "TanStack hooks" because behavior was
  preserved verbatim. Rewording it is a Phase 2 item.
