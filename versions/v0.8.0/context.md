# v0.8.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Ship an optional `@apixa/tanstack-query` integration whose **primary public API** is a unified resource hook:

```tsx
const users = useResourceQuery(api.users, {
  queryKey: ["users"],
});

users.data;
users.isLoading;
users.error;

await users.create(input);
await users.update(id, input);
await users.delete(id);
await users.getById(id);
await users.invalidate();
```

One hook and one returned object cover list query state, Promise-based CRUD, cache invalidation, and per-mutation observers. Internal architecture uses TanStack Query natively; it must **support** this DX, not replace it with granular hooks as the recommended surface.

## Identity (this release)

- New package: `@apixa/tanstack-query` (optional integration)
- Peers: `@apixa/core`, `@tanstack/react-query` ^5, `react` ^18 \| ^19
- Core remains framework-agnostic (ADR 001)
- Maintained example: **`examples/frontends/next` only**

## What success looks like

- A Next CRUD playground page uses `useResourceQuery` instead of hand-rolled `useQuery` / `useMutation` / `setQueryData`.
- List fields (`data`, `isPending`, `isLoading`, `isFetching`, `isError`, `error`) reflect the **list query only**.
- Mutation pending/error/data live under `mutations.create` / `update` / `delete` (independent of list loading).
- After successful create/update/delete, list caches invalidate by default (correctness-first).
- Types for list data, create/update bodies, and operation results are inferred from the Apixa `ResourceClient` — no duplicated entity generics at the call site.
- `@apixa/core` gains **no** React or TanStack dependencies.

## Principles that bind this release

1. **Unified hook is non-negotiable** as the primary documented API.
2. Delegate caching and observers to TanStack Query — no Apixa-owned cache store.
3. Integrations depend on Core; Core never depends on integrations.
4. Correctness-first cache policy (invalidate lists) over clever `setQueryData` list patches.
5. Infer types from Apixa operation signatures, not hard-coded `string | number` / entity assumptions beyond what Core already encodes.
6. Docs honest: advanced/granular exports are escape hatches, not the default path.
7. Native promises from Core remain the transport into `queryFn` / `mutationFn`.

## Baseline in the repo today

- `@apixa/core` — `defineApi`, default-first CRUD, `ResourceClient`, `ApiError` hierarchy, `signal` on call options.
- `@apixa/mocking` — optional peer / `defineMockApi`.
- Next playground — manual TanStack keys, queries, and mutation cache edits (`examples/frontends/next`).
- No `@apixa/tanstack-query` package yet (roadmap-planned until this milestone).

## Non-goals for this folder

Optimistic-update helpers, infinite-query helpers, automatic custom-operation wiring, list `patch-list` strategies as defaults, Core React, OpenAPI, client/server packages, live pagination conventions in Core.

See [scope.md](./scope.md).
