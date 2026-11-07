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
- [x] `useResourceMutation` inherits every enabled write with exact types, native options, independent states, and client-only operations.
- [x] `useResource` composes both hooks with flat state/operations, `operations`, `states`, and read/write routing.
- [x] Custom Core operations require explicit kinds; incompatible HTTP methods fail before dispatch.
- [x] Query-side `readOperations` and the single-operation mutation overload are removed.
- [x] `useResource` takes flat `mutations` options and composes the two public hooks.
- [ ] Advanced controllers preserve every valid Core signature and operation availability.
- [x] Packed consumers and React 18/19 integration checks pass on this stabilization change.
- [x] Query DX features (prefetch, cache, cancel, infinite mode, direct mutation state, optimistic
      updates) live inside the three hooks; no new hooks.
- [x] The Query suite passes at runtime on TanStack 5.90.1 and 5.106.1 with React 18.3.1 and 19.1.1.
- [x] Optimistic updates stay correct under concurrent, out-of-order, failing, and retried calls;
      a fetch sent before a successful write cannot replace its confirmed data.
- [x] The SSR example hydrates in a real browser (dev and production) without warnings, loading
      flashes, or duplicate initial fetches; request-scoped caches do not share data.
- [x] Opt-in idempotency keeps one key per call across Core retries, middleware replay, and
      TanStack retries; function operations reject the option.
- [x] A Core-only consumer builds and runs without React or TanStack installed.
- [x] A declarative custom operation on a mocked resource rejects with `MOCK_UNSUPPORTED` and never
      runs a builtin or touches the store; mock writes reject prototype-changing keys.
- [x] `@apixa/core` is a bounded peer dependency of `@apixa/mocking`; registration reaches the app's
      Core even when Core is duplicated, and npm refuses an incompatible Core.
- [x] `defineMockApi` and Core mocks return the same `getAll` results for filters, pages, cursors,
      `slice` and reset; a paginated read copies only its page.
- [x] One dataset can be imported on its own (`@apixa/mocking/datasets/<name>`) and loads only that
      dataset in Node, Vite, esbuild and Next; `loadDataset` stays lazy.
- [x] The tracked example typechecks inside `pnpm typecheck`, and CI runs the packed-consumer checks.
- [x] A custom declarative operation can define its mocked behavior with an inline typed `mock`
      handler; without one it stays `MOCK_UNSUPPORTED`, and a live resource ignores it.
- [x] `pnpm check:architecture` passes: dependency direction, no cycles, no React/TanStack/Node leakage
      into Core or edge-safe Mocking entries, no private shared specifier in built output.
- [x] The `apixa` facade re-exports the canonical packages (curated root, `apixa/core`, mocking and
      React subpaths); packed consumers cover a root-only Node install without React, React 18 and
      19 with Vite, and Next.js production and development builds with Server Component prefetch
      and hydration.
- [x] Release-candidate gates pass: public API snapshot, real-browser SSR and hydration, `workerd` and
      Vercel Edge Runtime runs of the packed facade, Node 22 and 24, errors do not expose request
      headers or bodies.
- [ ] Full v1 release requirements beyond this Query workstream are completed and published.
