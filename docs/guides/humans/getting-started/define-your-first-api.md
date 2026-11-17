# Define your first API

Status: **implemented** for the v3 resource shape (`3.0.0-rc.0` in this repository). Install first: [Install and choose an entry point](./install-apixa.md).

One resource definition produces the typed client. Paths and operation selection live in the config. Payload types live on the resource.

```ts
import { createResource, defineApi } from "apixa";

type User = { id: string; name: string; email: string };

const users = createResource<User>()({ path: "/users" });

export const api = defineApi({
  baseURL: "https://api.example.com",
  resources: { users },
});

const list = await api.users.getAll();
const user = await api.users.getById("123");
```

`defineApi<AppApi>()({ resources: { users: { path: "/users" } } })` is the same client when `AppApi` maps `users` to `User`. An explicit `AppApi` entry wins if both forms are present.

With only `path`, all 13 built-ins are generated. A name on the client does not mean the backend implements that route. Disable a built-in with `operations: { delete: false }` or add a route the backend actually has: [Custom operations](../features/custom-operations.md).

Defaults inherit from `defineApis` options, then the API, then the resource, then operation fields. `settings` on those three scopes is the same inheritance, not a separate system. An operation does not take `settings`; it overrides with `timeout`, `retry`, `response`, or `middleware`. Call options accept `signal` and `timeout`. The full table is in [conventions](../../../conventions.md#configuration-shape). Schemas are in [Schemas](../features/schemas.md). The export list is in [public-api.md](../../../public-api.md).
