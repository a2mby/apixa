# Use Apixa in React

Status: **implemented** for React 18 or 19 with TanStack Query v5 (`>=5.90.1`). Vue and Angular subpaths are planned only.

Install peers with the library, then import hooks from `apixa/react`:

```sh
npm install apixa @tanstack/react-query
```

```tsx
import { useResourceQuery } from "apixa/react";
import { api } from "./api";

export function Users() {
  const users = useResourceQuery(api.users, { queryKey: ["users"] });
  if (users.isPending) return null;
  return (
    <ul>
      {users.data?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

Wrap the tree in `ApixaProvider`, or keep TanStack's `QueryClientProvider`. The hooks share that one cache. `useResourceMutation` covers writes. `useResource` is the combined facade. Infinite pagination is a mode of `useResourceQuery`, not a second hook.

Server prefetch uses a new `QueryClient` per request from `apixa/react/advanced`: `prefetchResourceQuery`, then `dehydrate`, then `ApixaHydrationBoundary` from `apixa/react`.

If `@tanstack/react-query` is missing, `useResourceQuery`, `useResource`, and `useResourceMutation` lose inference and type their result as `ApixaMissingPeer_Install_tanstack_react_query`.

Entry points and peers: [Install and choose an entry point](./install-apixa.md). Hook options, keys, and files: [React package README](../../../../packages/react/README.md). Pagination inputs: [Pagination](../features/pagination.md).
