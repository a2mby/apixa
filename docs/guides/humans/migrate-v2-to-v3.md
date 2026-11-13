# Migrating from Apixa v2 to v3

This guide covers the breaking changes and new capabilities in **Apixa `3.0.0-rc.0`**. At this release-candidate stage, `apixa@2.0.0` remains the published `latest` package on npm while `3.0.0-rc.0` is prepared and verified in the repository.

## 1. Built-in operations consolidated (16 -> 13)

Three redundant or ambiguous built-ins were removed from runtime generation, selection presets, and `MockStore` built-in execution:

- **Removed:** `getBySlug`, `upsert`, `search`
- **Retained (13 built-ins):**
  - `crud` (5): `getAll`, `getById`, `create`, `update`, `delete`
  - `extended` (8): `patch`, `count`, `createMany`, `deleteMany`, `getMany`, `exists`, `findFirst`, `getBy`

### How to migrate removed built-ins

Define them explicitly as declarative custom operations (with an optional `mock` handler if the resource is mocked), or use `getAll` / `update`:

```ts
// Before (v2)
await api.posts.getBySlug("hello-world");
await api.users.search({ query: { name: "Ada" } });
await api.users.upsert("1", { name: "Ada" });

// After (v3)
const api = defineApi({
  baseURL: "https://api.example.com",
  resources: {
    posts: {
      path: "/posts",
      operations: {
        getBySlug: {
          kind: "read",
          method: "GET",
          path: "/slug/:slug",
          mock: ({ store, params }) => store.list({ slug: params.slug })[0] ?? null,
        },
      },
    },
    users: {
      path: "/users",
      operations: {
        search: {
          kind: "read",
          method: "GET",
          path: "/search",
        },
      },
    },
  },
});

await api.posts.getBySlug({ params: { slug: "hello-world" } });
await api.users.search({ query: { name: "Ada" } });
// Or filter directly with getAll:
await api.users.getAll({ query: { name: "Ada" } });
// Replace upsert with update or an explicit write operation:
await api.users.update("1", { body: { name: "Ada" } });
```

> **Note on custom declarative operations:** Declarative reads (`GET`/`HEAD`/`OPTIONS`) take one `options` object (`{ params, query, headers, ... }`). Declarative writes (`POST`/`PUT`/`PATCH`/`DELETE`) default to `hasBody: true` (`(body, options?)`); set `hasBody: false` if a custom write endpoint takes no body and should be called with `{ params: { id } }`.

## 2. `update` and `patch` require `options.body`

In v3, `params`, `query`, and `body` occupy stable positions. Detail writes take `(id, options)` where the request payload lives under `options.body` (in Core, `apixa/react`, and `defineMockApi`). Calling `update(id, body)` or `patch(id, body)` without `{ body }` is both a TypeScript error and a runtime `ValidationError`.

```ts
// Before (v2)
await api.users.update("42", { name: "Ada Lovelace" });
await api.users.patch("42", { active: true }, { headers: { "X-Reason": "audit" } });

// After (v3)
await api.users.update("42", { body: { name: "Ada Lovelace" } });
await api.users.patch("42", {
  body: { active: true },
  headers: { "X-Reason": "audit" },
});
```

### React hooks (`apixa/react`)

Inherited mutations and optimistic updaters mirror the exact Core parameter tuple:

```tsx
const users = useResourceMutation(api.users, {
  queryKey: ["users"],
  mutations: {
    update: {
      optimistic: {
        detail: ([id]) => id,
        update: (current, [, { body }]) => ({ ...current, ...body }),
      },
    },
  },
});

await users.update("42", { body: { name: "Grace" } });
await users.patch("42", { body: { active: false } });
```

### `defineMockApi()` (`apixa/mocking`)

`defineMockApi()` shares the same 13 built-in names (`MOCK_BUILTINS`) and v3 `update` / `patch` signatures:

```ts
await mockApi.users.update("1", { body: { name: "Ada" } });
await mockApi.users.patch("1", { body: { email: new Blob(["fixture"], { type: "text/plain" }) } });
```

## 3. Unified `middleware` hook lists

Separate `middleware`, `requestMiddleware`, `responseMiddleware`, and `errorMiddleware` properties are consolidated into a single `middleware: { onRequest?, onResponse?, onError? }` object at root, resource, and operation levels:

```ts
// Before (v2)
const refresh: Middleware = async (ctx, next) => {
  const res = await next();
  return res.status === 401 ? next() : res;
};

const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: [refresh],
  resources: { users: { path: "/users" } },
});

// After (v3)
import { defineApi, isHttpError, type MiddlewareHooks } from "apixa";

const authHooks: MiddlewareHooks = {
  onRequest: [
    (request) => {
      request.headers.set("Authorization", `Bearer ${getToken()}`);
    },
  ],
  onError: [
    async (error, { replay }) => {
      if (isHttpError(error) && error.status === 401 && replay) {
        await refreshToken();
        return replay();
      }
    },
  ],
};

const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: authHooks,
  resources: { users: { path: "/users" } },
});
```

- Hook execution runs `root -> resource -> operation`, in array order within each level.
- Request middleware sees `request.query` already transformed by `transforms.request`; any mutations to `request.query` or `request.url` stay synchronized across live transport, mocks, URLs, and `response.request` / `error.request` metadata.

## 4. Declarative operation `kind` derivation

Declarative HTTP operations now derive `kind` (`"read"` vs `"write"`) from their HTTP `method` (`GET`, `HEAD`, `OPTIONS` -> `"read"`; `POST`, `PUT`, `PATCH`, `DELETE` -> `"write"`). Passing `kind` on a declarative operation remains accepted when consistent, while function operations (`{ kind, run }`) still require an explicit `kind`.

## 5. Client-wide query serialization (`query` and `queryArrayFormat`)

Configure query serialization once at the root of `defineApi`:

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  queryArrayFormat: "brackets", // "repeat" | "comma" | "brackets"
  query: {
    nulls: "empty", // "omit" (default) | "empty" | "null"
    emptyArrays: "empty", // "omit" (default) | "empty"
    booleans: "number", // "string" (default) | "number"
  },
  resources: { users: { path: "/users" } },
});
```

Nested plain objects encode using bracket notation (`filter[role]=admin`), `Date` encodes as ISO-8601, and unsupported values (`NaN`, `Infinity`, symbols, functions, circular references, nesting beyond depth 64) throw `SerializationError`.

## 6. Response pipeline, `response.unwrap` / `parse` / `validate`, and `source`

Configure response envelope extraction, parsing, and validation at root, resource, or operation level (most specific wins; pass `false` on a hook to disable an inherited rule):

```ts
const api = defineApi<{ users: { entity: User } }>()({
  baseURL: "https://api.example.com",
  response: {
    unwrap: "data",
    validate: (data) => {
      if (!data) throw new Error("Empty payload");
    },
  },
  transforms: {
    response: {
      keys: "camelCase",
      exclude: ["meta"],
      preserve: ["metadata"],
      maxDepth: 64,
    },
  },
  resources: {
    users: { path: "/users" },
    health: {
      path: "/health",
      response: { unwrap: false, validate: false },
    },
  },
});

const full = await api.users.getById("1", { full: true });
// full.data   -> unwrapped, key-transformed, parsed, validated User
// full.source -> original parsed transport/mock body prior to response stages
```

- Invalid collection payloads (for example `getMany` or `findFirst` receiving a non-array) now throw `ResponseShapeError` instead of silently collapsing to `[]`; valid empty arrays remain valid.
- Key transforms accept `KeyTransformConfig` (`{ keys, exclude?, preserve?, maxDepth? }`) and throw `TransformError` on cycles, excessive depth (default `64`), or key collisions.

## 7. Opt-in pagination per operation and strict `slice`

Pagination can now be configured on a resource **or** on individual list operations (`getAll`, `getMany`, and declarative custom reads):

```ts
const api = defineApi<{ users: { entity: User } }>()({
  baseURL: "https://api.example.com",
  resources: {
    users: {
      path: "/users",
      operations: {
        getAll: { pagination: { type: "page", preset: "laravel" } },
        exportAll: { kind: "read", method: "GET", path: "/all", pagination: false },
      },
    },
  },
});

const page = await api.users.getAll({ query: { page: 2, pageSize: 25 } });
```

- Operation-level `pagination` cleanly shadows resource-level `pagination` (setting `pagination: false` on an operation opts it out of resource pagination).
- `slice` uses strict `Array.prototype.slice` semantics on client-side lists and now throws `ConfigError` if combined with `pagination`.
