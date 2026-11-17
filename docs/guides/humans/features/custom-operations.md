# Custom operations

Status: **implemented**. The full built-in table, presets, and call shapes are in [conventions](../../../conventions.md#operation-customization). This page is only the decision of when to add an operation.

A resource with `path` already exposes 13 built-ins (`getAll`, `getById`, `create`, `update`, `delete`, `patch`, `count`, `createMany`, `deleteMany`, `getMany`, `exists`, `findFirst`, `getBy`). Add a custom operation when the backend has a route those names do not represent. Remove a built-in the backend does not implement with `false`.

`getBySlug`, `upsert`, and `search` were removed in v3. Define them only when the backend still has those routes. The upgrade examples are in [Migrate from Apixa v2 to v3](../migrations/v2-to-v3.md).

```ts
import { defineApi } from "apixa";

const api = defineApi({
  baseURL: "https://api.example.com",
  resources: {
    users: {
      path: "/users",
      operations: {
        delete: false,
        archive: {
          kind: "write",
          run: (ctx, id: string) => ctx.request({ method: "POST", path: `/${id}/archive` }),
        },
      },
    },
  },
});

await api.users.archive("123");
```

Declarative HTTP operations take `path` and derive `kind` from `method` (`GET`, `HEAD`, and `OPTIONS` are reads; `POST`, `PUT`, `PATCH`, and `DELETE` are writes). Omitting `method` means `GET`. A body schema does not select a write method. `kind: "write"` without a method is a configuration error. A function operation must set `{ kind, run }` and should call `ctx.request()` so headers, retry, middleware, and errors stay on the normal pipeline. Operations do not take a `settings` object.

`operations` selects methods on the client. It does not create the route on the server. Calling a generated method the backend does not implement returns that backend's 404.
