# v0.8.0 — Acceptance criteria

Check every item before calling v0.8.0 done.

## Package and boundaries

- [x] `@apixa/tanstack-query` exists under `packages/tanstack-query/`, builds (ESM + types), and is included in root build/typecheck.
- [x] Peer dependencies declare `@apixa/core`, `@tanstack/react-query` ^5, and `react` ^18 \| ^19.
- [x] `@apixa/core` has **no** React, Next.js, or TanStack Query dependencies.
- [x] No other new packages (`client`, `server`, `openapi`, `transport-fetch`) were added in this milestone.

## Unified public API

- [x] `useResourceQuery` is the documented primary export from `@apixa/tanstack-query`.
- [x] Calling `useResourceQuery(api.users, { queryKey: ["users"] })` yields one object with list state, Promise ops, cache helpers, and `mutations.*`.
- [x] `users.data` / `isPending` / `isLoading` / `isFetching` / `isError` / `error` reflect the **list query only**.
- [x] `users.mutations.create|update|delete` expose independent mutation observer state (`isPending`, `error`, `data`, `mutate`, `mutateAsync`, …).
- [x] `await users.create(input)`, `await users.update(id, input)`, `await users.delete(id)`, `await users.getById(id)`, and `await users.invalidate()` work as documented.
- [x] `getById` uses QueryClient fetch APIs (no conditional/dynamic React hooks).
- [x] Internal `useQuery` + three `useMutation` + `useQueryClient` are always called unconditionally.

## Cache and callbacks

- [x] Successful create/update/delete **invalidate** list queries under the resource key prefix by default.
- [x] Failed mutations do **not** invalidate lists.
- [x] Detail cache is seeded/updated on successful create/update when an entity is returned; removed on successful delete.
- [x] Apixa cache sync is awaited **before** consumer `onSuccess` sees post-sync cache (D1).
- [x] Query keys include `scope` (when set), required `queryKey`, list vs detail segments, and **all list `query` params** that affect the response (D4).

## Types

- [x] Create/update input and list/entity results infer from the Apixa resource without extra entity generics at the call site (D3).
- [x] Operation id/path argument types follow the resource’s Core signatures (not a hard-coded assumption unrelated to the client).
- [x] Type tests under `tests/` cover inference smoke cases.

## Escape hatches

- [x] Advanced/controller or options exports exist for power users.
- [x] README and Next example recommend **only** the unified hook for normal CRUD.

## Example and docs

- [x] Next CRUD playground migrated to `useResourceQuery` (forms/UI state remain app-owned).
- [x] No drive-by edits to non-Next examples.
- [x] Package README documents unified DX, callback order, pending-state rules, and observer-cost trade-off.
- [x] Living docs (`context` §6, architecture workspace map, roadmap) mark this integration as implemented for the shipped surface.
- [x] CHANGELOG lists the new package and behavior.
- [x] Docs do **not** claim `patch-list`, optimistic helpers, or infinite-query support as shipped.

## Tests

- [x] Unit tests cover keys + invalidate-first policy with `QueryClient` (fake resource / no live network).
- [x] Hook tests cover list-vs-mutation pending isolation and overlapping mutation pending semantics (D2).
- [x] Tests cover failed mutation (no invalidation) and `getById` detail cache behavior.
- [x] `pnpm` typecheck and test scripts relevant to the new package pass.

## Explicitly deferred (must remain unchecked as “shipped”)

- [ ] ~~patch-list cache strategy~~ — **out** (confirm not documented as supported).
- [ ] ~~optimistic update helpers~~ — **out**.
- [ ] ~~infinite query helpers~~ — **out**.
- [ ] ~~auto custom operations on the unified object~~ — **out**.

_(Deferred items intentionally left unchecked — not shipped.)_

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed or consciously waived with a note here.
- [x] [docs/story.md](../../docs/story.md) updated with a completion note.
- [x] Five locked corrections (D1–D5) verified against the implementation.

Implementation-plan notes: Steps 2–7 completed. No Core feature changes. Deferred D5 items (`patch-list`, optimistic, infinite, auto custom ops) remain out.
