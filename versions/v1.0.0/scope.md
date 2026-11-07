# v1.0.0 — TanStack integration scope

## In

- Native TanStack v5 query option and result parity, except generated function/key ownership.
- Exact Core read-operation argument and return inference, including enabled/disabled methods.
- Standard read selectors and explicitly declared custom reads.
- Hierarchical list, detail, scoped, and operation query keys.
- QueryClient-backed cache operations and imperative detail fetching.
- Hook-free `createResourceQueryOptions` for native queries, Suspense, parallel queries, and SSR.
- Signal forwarding, retry behavior, pagination identity, lifecycle, package builds, and examples.
- Migration documentation for the query/write split.
- Core `kind` / `{ kind, run }` classification and non-enumerable operation metadata.
- Mandatory custom kinds, fixed builtin kinds, and method/kind validation before transport or
  mock dispatch.
- Resource-wide `useResourceMutation` (inherited operations, per-operation native options, states,
  client-only operations, typed invalidation) and the `useResource` facade.
- Read-only query and write-only mutation exposure; removal of `readOperations` and the
  single-operation mutation overload; flat `useResource` mutation configuration.
- Advanced controller signatures that preserve Core operation arguments and results.
- Query DX refinement inside the three hooks (no new hooks): `prefetch`, `cache.get/set/remove`,
  and `cancel` on query results; infinite mode in `useResourceQuery` on native
  `useInfiniteQuery`; direct mutation state on callable writes; declarative, concurrency-safe
  `optimistic` updates; advanced `prefetchResourceQuery` / `prefetchResourceInfiniteQuery` for SSR;
  `"lists"` invalidation covering infinite lists.
- Opt-in Core `idempotency` on write operations (one key per call, reused by Core retries,
  middleware replay, and TanStack mutation retries). Off by default; the only Core behavior
  addition in this workstream.
- Mocking stabilization: no URL-guessed custom operations on mocks, prototype-safe writes, Core as a
  private build dependency of Mocking, one `getAll` contract for `defineApi` mocks and
  `defineMockApi`, page-only reads, per-dataset import paths, and a verified packed-consumer and
  example gate.

## Out

- Unrelated Core behavior changes, a second query cache, a global provider, or a custom infinite scheduler.
- Automatic classification of custom functions as reads (Core `kind` is explicit).
- npm publication or declaring the entire v1.0.0 release shipped.

## Architecture addendum (2026-11-07)

Package layout and boundaries for the unified release are described in
[ADR 004](../../docs/decisions/004-four-packages-and-private-shared-internals.md),
[docs/architecture.md](../../docs/architecture.md#architecture-contract-v100) and
[docs/public-api.md](../../docs/public-api.md). In scope and implemented: the private
`@apixa/internal-shared` layer, `pnpm check:architecture`, the `@apixa/tanstack-query` →
`@apixa/react` rename, `ApixaProvider`, an Apixa `QueryClient`, `ApixaHydrationBoundary`, the
server-safe `dehydrate`, and the `apixa` facade (curated root plus `core`, `mocking*` and `react*`
subpaths). The original four-publication strategy was superseded by the owner decision below; none was published.

## Final packaging decision (2026-11-08)

[ADR 005](../../docs/decisions/005-single-package-distribution.md) is authoritative: publish only
`apixa@1.0.0-rc.0`. All four implementation modules remain private. In scope: a single code-split
runtime distribution, isolated canonical declarations, optional React peers, all 14 existing public
subpaths, single-tarball consumer/browser/Edge verification, architecture guards and release docs.
No business-logic redesign, new frameworks, real publication, commit or push is part of this migration.
