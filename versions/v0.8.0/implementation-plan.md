# v0.8.0 — Implementation plan

Smallest path to `@apixa/tanstack-query` with **unified** `useResourceQuery` as the primary API. Core stays framework-agnostic. Do not implement until this plan is the coding contract.

## Design decisions to lock while coding

### D1 — Callback composition (required correction)

**Guarantee:** Apixa cache synchronization runs to completion **before** consumer success/settled callbacks observe a consistent cache.

**Contract:**

1. Default cache work (list invalidation, detail `setQueryData` / `removeQueries`) lives in the mutation’s **`onSuccess`** (and detail removal on delete), always **awaited**.
2. After Apixa cache work resolves, invoke any consumer `onSuccess` from `options.mutations.{create,update,delete}` (and preserve TanStack’s per-`mutate`/`mutateAsync` call-site callbacks via normal TanStack ordering).
3. Use **`onSettled`** only for work that must run on both success and failure (e.g. clearing transient UI flags). **Do not** invalidate lists on failure.
4. Document order explicitly in the package README:

   ```text
   mutation resolves
     → Apixa cache sync (await invalidate / detail write)
     → consumer onSuccess (options + mutateAsync callbacks per TanStack rules)
     → onSettled (Apixa none-by-default; then consumer)
   ```

5. Public Promise methods (`users.create`, etc.) are **`mutateAsync`**. Callers `await users.create()` only after cache sync + mutation resolution; they should not assume consumer `onSuccess` has finished unless they chained it themselves.

**Non-goal:** Reimplementing TanStack’s callback scheduler.

### D2 — Concurrency & pending-state semantics (required correction)

**Contract:**

1. Mount **one** `useMutation` observer per operation (`create`, `update`, `delete`) for the lifetime of the hook instance.
2. `users.mutations.create.isPending` is **that observer’s** pending flag only. List `users.isPending` / `isLoading` / `isFetching` never OR-in mutation pending.
3. TanStack default: mutations run **in parallel**. Overlapping `create` calls share one observer — `isPending` stays true while **any** in-flight mutation for that observer is active (TanStack v5 semantics). Do not invent a second pending counter.
4. Overlapping invalidations: rely on QueryClient coalescing; do not add a custom mutex.
5. Detail writes (`setQueryData` after create/update): last successful write wins; always pair with list **invalidation** so list views converge on server truth.
6. Document: one `useResourceQuery` per resource container — do not call the hook once per list row.
7. Optional later (out of v0.8.0 acceptance): mutation `scope` for serial queues — not required to ship.

### D3 — Type inference from Apixa (required correction)

**Contract:**

1. Generic the hook on the resource client: `useResourceQuery<TResource>(resource: TResource, options)`.
2. Infer via operation call signatures (no duplicate `entity` generic on the hook):

   - List data ← `ReturnType` / `Promise` resolve of `getAll`
   - Entity ← resolve of `getById`
   - Create body ← first body parameter of `create`
   - Update body ← body parameter of `update`
   - Id / path args ← parameter types of `getById` / `update` / `delete` (use `Parameters<TResource["getById"]>[0]`, etc. — **do not** hard-code `string | number` if Core’s signature is what we expose; match Core’s public params exactly)
   - Results ← Promise resolve types of each op

3. Public `update(id, body)` / `delete(id)` / `getById(id)` mirror Core positional arity; if Core uses a params object for multi-param paths, the unified API must accept the same first-arg shape as `Parameters<TResource["update"]>[0]` (etc.).
4. Avoid `any` in public types; use inference helpers in `types.ts`. Prefer `ResourceClient` from `@apixa/core` as a constraint when it improves inference.
5. Error generic defaults to `Error`; runtime remains `ApiError` — document `isApiError` usage; do not force `ApiError` into every TanStack generic unless inference stays clean.

### D4 — Cache identity / query keys (required correction)

**Key shape:**

```ts
[...scope, ...queryKey, "list", listQueryParams?]
[...scope, ...queryKey, "detail", id]
[...scope, ...queryKey, "mutation", "create" | "update" | "delete"] // mutationKey only
```

**Contract:**

1. `queryKey` is **required** on options (Core clients have no resource name).
2. Optional `scope` (e.g. tenant / env) prepends every key for isolation across clients/backends.
3. Every argument that changes `getAll` response identity must appear in the list key — at minimum the `query` object passed into list options / hook options. If additional call options later affect data (e.g. custom headers that select a view), either include them in the key or document that they must be folded into `query` / `scope`.
4. Detail keys include the same `id` value passed to `getById` / update / delete.
5. Partial invalidation: `keys.lists()` invalidates all list variants under the resource; `keys.detail(id)` targets one detail; `keys.all()` / `invalidate()` covers the resource root.
6. Stabilize keys: pass serializable params; rely on TanStack’s deterministic hash for object key order.

### D5 — v1 cache scope (required correction)

**Ship:**

- Default **`invalidateQueries` on list key prefix** after successful create / update / delete.
- Detail: `setQueryData` when mutation returns a full entity; `removeQueries` on delete for that detail key.
- `invalidate()` / `refetch()` on the facade.

**Defer (explicit non-steps for acceptance):**

- `cache.onCreate: "patch-list"` (and friends) as a supported product option
- Optimistic update helpers / rollback utilities
- Infinite query / pagination helpers
- Auto custom-operation mutations on the unified object

Consumers who need instant list patches can use TanStack APIs via escape hatches or local `onSuccess` — not Apixa v0.8.0 defaults.

### Other locks

6. **Primary API:** `useResourceQuery` only in README / Next example happy path. Granular hooks / controller exports are `@advanced` or subpath — never replace the unified DX in docs.
7. **Internals:** Controller builds `queryOptions` / `mutationOptions`; the unified hook always mounts `useQuery` + three `useMutation`s + `useQueryClient`.
8. **Import path:** `import { useResourceQuery } from "@apixa/tanstack-query"` — no Core export; no required global `apixa` object.
9. **Provider:** App-owned `QueryClientProvider` (Next already has one locally); package does not ship a mandatory Apixa provider.
10. **Examples rule:** Touch **`examples/next` only**.

## Target developer surface (normative)

```tsx
"use client";

import { useResourceQuery } from "@apixa/tanstack-query";
import { api } from "@/lib/api";

function UsersPage() {
  const users = useResourceQuery(api.users, {
    queryKey: ["users"],
  });

  if (users.isPending) return <p>Loading…</p>;
  if (users.isError) return <p>{users.error.message}</p>;

  return (
    <ul>
      {users.data?.map((user) => (
        <li key={user.id}>
          {user.name}
          <button
            disabled={users.mutations.delete.isPending}
            onClick={() => void users.delete(user.id)}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
```

## Ordered steps

### 1. Freeze contract pointers (this kickoff) — done

### 2. Package skeleton — done

### 3. Types + key factory + controller (no React hook yet) — done

### 4. Implement `useResourceQuery` — done

### 5. Escape hatches — done (`@apixa/tanstack-query/advanced`)

### 6. Migrate Next CRUD playground — done

### 7. Docs + CHANGELOG — done

## Explicit non-steps

- Do not add React/TanStack to `@apixa/core`.
- Do not implement `patch-list`, optimistic helpers, infinite queries, or custom-op auto surface for acceptance.
- Do not make granular `useList` / `useCreate` the documented default.
- Do not create `client`, `server`, `openapi`, or `transport-fetch` packages.
- Do not edit `examples/basic`, `react-vite`, `vue`, etc.
- Do not start implementation in the `/start-version` kickoff itself.

## Suggested file touch list

| Path                                                         | Action                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `packages/tanstack-query/**`                                 | New package (types, keys, controller, hook, advanced, README)                                                    |
| `package.json` (root)                                        | Include build/typecheck for new package                                                                          |
| `pnpm-workspace.yaml`                                        | Already `packages/*` — verify                                                                                    |
| `tests/tanstack-query/**`                                    | New unit + hook + type tests                                                                                     |
| `examples/next/lib/users.ts`                                 | Resource query setup / remove hand keys as needed                                                                |
| `examples/next/app/test/page.tsx` and/or components          | Migrate to `useResourceQuery` (Next only; respect gitignore for local scaffolding)                               |
| `docs/context.md`, `docs/architecture.md`, `docs/roadmap.md` | Honesty when shipping                                                                                            |
| `CHANGELOG.md`, `docs/story.md`                              | Ship notes                                                                                                       |
| `packages/core/**`                                           | **No feature changes** unless a blocking type export is missing (prefer infer from public `ResourceClient` only) |

## Done when

All items in [acceptance-criteria.md](./acceptance-criteria.md) pass.
