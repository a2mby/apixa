# v0.8.0 — Scope

## In scope

### 1. Package: `@apixa/tanstack-query`

- New workspace package under `packages/tanstack-query/`
- ESM build (tsup), `sideEffects: false` where accurate
- Peer dependencies: `@apixa/core` (workspace), `@tanstack/react-query` ^5, `react` ^18 \| ^19
- Depends on `@apixa/core` types/runtime as a normal dependency or peer — **prefer peer** so apps share one Core instance
- Root `pnpm` `build` / `typecheck` scripts include the new package
- **No** React / TanStack Query added to `@apixa/core`

### 2. Primary public API — `useResourceQuery`

```tsx
import { useResourceQuery } from "@apixa/tanstack-query";

const users = useResourceQuery(api.users, { queryKey: ["users"] });
```

Required surface on the returned object:

| Area                     | Members                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| List query state         | `data`, `error`, `isPending`, `isLoading`, `isFetching`, `isError`, `isSuccess`, `status` |
| Underlying list observer | `query` (TanStack `UseQueryResult` escape)                                                |
| Promise ops              | `getById`, `create`, `update`, `delete` (throwing / `mutateAsync` semantics)              |
| Cache                    | `invalidate`, `refetch`, `keys`                                                           |
| Mutation state           | `mutations.create` / `update` / `delete` (full `UseMutationResult`)                       |

**Rules:**

- List loading fields must **not** mix mutation pending state.
- All internal hooks (`useQuery`, three `useMutation`, `useQueryClient`) called unconditionally (Rules of Hooks).
- `getById` is imperative via `QueryClient.fetchQuery` (or `ensureQueryData`) — not a dynamic React hook.
- `create` / `update` / `delete` public signatures stay Core-ergonomic (positional `update(id, body)`); map to TanStack mutation variables internally.

### 3. Automatic cache management

- **Default:** correctness-first — on successful create/update/delete, `invalidateQueries` for list key prefix; sync/remove detail keys when applicable.
- Resource-level options for query passthrough (`enabled`, `staleTime`, list `query` params, etc.).
- Consumer mutation/query callbacks remain composable (see implementation-plan locking decisions).
- **Defer** opt-in `patch-list` / optimistic helpers from v0.8.0 acceptance (may land later without blocking this version).

### 4. Type inference

- Infer list data, entity, create body, update body, and mutation results from the supplied Apixa resource client.
- Infer path/id parameter types from operation call signatures where Core exposes them (do not widen everything to `string \| number` if the resource signature is narrower or structured).
- Do not require consumers to re-declare `User` / create-input types solely for the hook.

### 5. Escape hatches (secondary)

- Expose internal controller / `queryOptions` / `mutationOptions` / key helpers for advanced use (named export or `@apixa/tanstack-query/advanced`).
- Document as optional; README and Next example lead with `useResourceQuery` only.

### 6. Example and docs

- Migrate Next CRUD playground (`examples/next` — maintained example only) to `useResourceQuery`.
- Keep form/UI state in the app; remove repetitive TanStack glue.
- Update living docs: `docs/context.md` §6, `docs/architecture.md` workspace map, package README, root CHANGELOG, `docs/story.md` on completion.
- Mark implemented vs planned (no infinite-query / optimistic product claims).

### 7. Tests

- Type-level tests for inference from a typed `defineApi` resource.
- Unit tests: key factory, cache invalidation policy with a real `QueryClient` (no network).
- Hook tests: list vs mutation pending isolation; create/update/delete; `getById` cache seed; callback order.
- Concurrency: overlapping mutations; pending-state accuracy.
- Fake / mock Apixa resource or existing mock transport — no flaky live network.

## Out of scope

| Item                                                                | Why                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| React / TanStack inside `@apixa/core`                               | ADR 001                                                 |
| `patch-list` / optimistic-update product helpers                    | Deferred; correctness-first invalidation only in v0.8.0 |
| Infinite query / pagination helpers                                 | Needs Core live pagination conventions; later           |
| Auto-wiring custom resource operations (`cancel`, `refund`, …)      | Escape hatch only this release                          |
| Granular hooks as the **recommended** DX                            | Unified hook is the product API                         |
| `@apixa/client` / `@apixa/server` / OpenAPI / transport-fetch split | Other milestones                                        |
| Editing non-Next examples                                           | `apixa-examples` rule — Next only                       |
| Disabling Core builtins / resource identity on Core clients         | Core change; not required if `queryKey` is required     |
| Vue / Solid adapters                                                | Later                                                   |

## Constraints (non-negotiable)

- Unified `useResourceQuery` is the primary public API; internals adapt to it.
- No second Apixa caching layer on top of TanStack Query.
- No custom Promise wrappers around Core operations.
- Dependency direction: `@apixa/tanstack-query` → `@apixa/core`; never the reverse.
- Docs honest: planned ≠ implemented.
- Only create this one new package; do not stub unrelated packages.
