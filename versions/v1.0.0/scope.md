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
  peer dependency of `@apixa/mocking`, one `getAll` contract for `defineApi` mocks and
  `defineMockApi`, page-only reads, per-dataset import paths, and a verified packed-consumer and
  example gate.

## Out

- Unrelated Core behavior changes, a second query cache, a global provider, or a custom infinite scheduler.
- Automatic classification of custom functions as reads (Core `kind` is explicit).
- npm publication or declaring the entire v1.0.0 release shipped.
