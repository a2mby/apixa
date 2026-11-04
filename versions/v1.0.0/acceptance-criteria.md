# v1.0.0 — Query workstream acceptance

- [x] `useResourceQuery` is read-only and preserves the native TanStack result and option types.
- [x] Guaranteed Core built-in reads and explicitly declared custom reads execute directly with typed args.
- [x] Disabled and optional operations are not advertised as guaranteed methods.
- [x] `select`, defined initial data, page/cursor envelopes, and nested path arguments retain types.
- [x] Keys include response-defining arguments; list and detail cache keys remain compatible.
- [x] QueryClient owns invalidation, refetch, cancel, remove, reset, fetch, prefetch, and ensure.
- [x] Hook-free options support native `useQuery`, `useQueries`, `useSuspenseQuery`, and hydration.
- [x] Query cancellation reaches standard Core operations; custom operations can bind signal explicitly.
- [x] Frozen install, complete build/typecheck/test, Next production build, and packed consumers pass.
- [x] Core classifies custom operations (`kind`, `{ kind, run }`) with typed runtime metadata.
- [x] `useResourceQuery` keeps tracked-property re-render parity, binds signals by Core position, and inherits every enabled read.
- [x] `useResourceMutation` inherits every enabled operation with exact types, native options, independent states, and client-only operations.
- [x] `useResource` composes both hooks with flat state/operations, `operations`, `states`, and read/write routing.
- [ ] Full v1 release requirements beyond this Query workstream are completed and published.
