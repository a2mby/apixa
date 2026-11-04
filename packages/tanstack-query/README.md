# `@apixa/tanstack-query`

Optional TanStack Query integration for Apixa. **Primary API:** unified `useResourceQuery`.

## Install

```bash
pnpm add @apixa/tanstack-query @tanstack/react-query
```

Peer: `@apixa/core`, `@tanstack/react-query` ^5, `react` ^18 \| ^19.

Provide your own `QueryClientProvider` (not shipped by this package).

## Usage

```tsx
"use client";

import { useResourceQuery } from "@apixa/tanstack-query";
import { api } from "./api";

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

### Surface

| Area       | API                                                                                   |
| ---------- | ------------------------------------------------------------------------------------- |
| List query | `data`, `isPending`, `isLoading`, `isFetching`, `isError`, `error`, `status`, `query` |
| Ops        | `create`, `update`, `delete`, `getById` (Promise / `mutateAsync`)                     |
| Cache      | `invalidate`, `refetch`, `keys`                                                       |
| Mutations  | `mutations.create` / `update` / `delete`                                              |

List loading fields never include mutation pending. Use `users.mutations.create.isPending` for create UI.
`useResourceQuery` requires `getAll`; other detail and CRUD methods are exposed only when the
resource client has them. A `readOnly` resource therefore returns list and detail helpers without
write methods or mutation entries. Use `useResourceMutation` for a write-only operation.

### Cache policy (v0.8.0)

After **successful** create / update / delete:

1. Apixa awaits list `invalidateQueries` (and detail `setQueryData` / `removeQueries` as applicable).
2. Then consumer `onSuccess` from `mutations.*` options runs.

Failed mutations do **not** invalidate. Instant list `setQueryData` / optimistic helpers are **not** shipped yet.

Callback order:

```text
mutation resolves
  → Apixa cache sync (await)
  → consumer onSuccess
  → onSettled (consumer)
```

### Query keys

```ts
[...scope?, ...queryKey, "list", query?]
[...scope?, ...queryKey, "detail", id]
```

`queryKey` is required. Optional `scope` isolates tenants/backends. List `query` params are part of the key.

### Advanced

```ts
import { createResourceController } from "@apixa/tanstack-query/advanced";
```

Escape hatch for `queryOptions` / `mutationOptions` / keys. Prefer `useResourceQuery` for normal CRUD.

### Notes

- Call **one** `useResourceQuery` per resource container — not once per list row (each call mounts 1 query + 3 mutation observers).
- `getById` uses `QueryClient.fetchQuery` (imperative; no detail subscription unless you add one).
- Runtime errors are often `ApiError` from `@apixa/core` — use `isApiError`.
