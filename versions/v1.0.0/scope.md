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
- Resource-wide `useResourceMutation` (inherited operations, per-operation native options, states,
  client-only operations, typed invalidation) and the `useResource` facade.

## Out

- Core behavior changes, a second query cache, a global provider, or a custom infinite scheduler.
- Automatic classification of custom functions as reads (Core `kind` is explicit).
- npm publication or declaring the entire v1.0.0 release shipped.
