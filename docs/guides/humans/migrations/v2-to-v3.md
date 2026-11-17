# Migrating from Apixa v2 to v3

This is the library upgrade for code that already uses Apixa. A project that does not use Apixa yet starts at [Adopt Apixa](./adopt-apixa.md).

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
await api.users.update("1", { name: "Ada" });
```

> **Note on custom declarative operations:** Declarative reads (`GET`/`HEAD`/`OPTIONS`) take one `options` object (`{ params, query, headers, ... }`). Declarative writes (`POST`/`PUT`/`PATCH`/`DELETE`) default to `hasBody: true` (`(body, options?)`); set `hasBody: false` if a custom write endpoint takes no body and should be called with `{ params: { id } }`.

## 2. `update` and `patch` take positional `(id, body, options?)`

In v3 (finalized in [ADR-007](../../../decisions/ADR-007-apixa-v3-unified-api-contract.md)), every body-bearing built-in write takes `body` as a positional argument and `options` as the trailing parameter: `create(body, options?)`, `update(id, body, options?)`, `patch(id, body, options?)`, `createMany(items, options?)`, and `deleteMany(ids, options?)`. Passing `{ body }` in the second argument of `update` or `patch` is rejected at compile time when `body` is not an entity field, and missing `body` throws `ValidationError` at runtime.

```ts
await api.users.update("42", { name: "Ada Lovelace" });
await api.users.patch("42", { active: true }, { headers: { "X-Reason": "audit" } });
```

### React hooks (`apixa/react`)

Inherited mutations and optimistic updaters mirror the exact Core parameter tuple (`[id, body, options?]`):

```tsx
const users = useResourceMutation(api.users, {
  queryKey: ["users"],
  mutations: {
    update: {
      optimistic: {
        detail: ([id]) => id,
        update: (current, [, body]) => ({ ...current, ...body }),
      },
    },
  },
});

await users.update("42", { name: "Grace" });
await users.patch("42", { active: false });
```

### `defineMockApi()` (`apixa/mocking`)

`defineMockApi()` shares the same 13 built-in names (`MOCK_BUILTINS`) and v3 `update` / `patch` signatures:

```ts
await mockApi.users.update("1", { name: "Ada" });
await mockApi.users.patch("1", { email: new Blob(["fixture"], { type: "text/plain" }) });
```

## 3. Unified `middleware` hook lists (with attempt hooks)

Separate `middleware`, `requestMiddleware`, `responseMiddleware`, and `errorMiddleware` properties are consolidated into a single `middleware: { onRequest?, onAttempt?, onAttemptResponse?, onResponse?, onError? }` object at root, resource, and operation levels:

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
- `onRequest` middleware sees `request.query` already transformed by `transforms.request` (and
  renamed by live pagination `params`), while `request.body` transforms run after `onRequest`.
  Mutations to `request.query` or `request.url` stay synchronized across live transport, mocks,
  URLs, and `response.request` / `error.request` metadata (`request.query` wins on conflicts),
  and are re-validated against `schema.query` and pagination collision rules before dispatch.
- `onAttempt({ request, attempt })` runs before each live HTTP transport attempt with an isolated
  per-attempt `Headers` clone (`attempt` is 1-based).
- `onAttemptResponse({ request, attempt, response, retry })` runs after each live HTTP transport
  attempt before retry evaluation; calling `retry()` requests a bounded retry within the remaining
  `retry.count` and timeout budget.
- `onResponse` runs after `response` processing (`unwrap`, response transforms, `parse`, shaping,
  `validate`) and **before** `schema.response` and final built-in structural/pagination checks,
  with `ApiResponse.source` preserved; returning `undefined` keeps the current response.
- `onError` runs on failures: throwing replaces the error for later handlers, returning a non-`undefined`
  value recovers the call, returning `undefined` passes the original error on, and `replay` is
  `undefined` inside a replay.

## 4. Declarative operation `kind` derivation

Declarative HTTP operations now derive `kind` (`"read"` vs `"write"`) from their HTTP `method` (`GET`, `HEAD`, `OPTIONS` -> `"read"`; `POST`, `PUT`, `PATCH`, `DELETE` -> `"write"`). Passing `kind` on a declarative operation remains accepted when consistent, while function operations (`{ kind, run }`) still require an explicit `kind`.

## 5. Client-wide query serialization (`query`, `queryArrayFormat`, and `querySerializer`)

Configure query serialization once at the root of `defineApi` (root-only; not accepted on resources,
operations, or per call):

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  queryArrayFormat: "brackets", // "repeat" (default) | "comma" | "brackets"
  query: {
    nulls: "empty", // "omit" (default) | "empty" | "null"
    emptyArrays: "empty", // "omit" (default) | "empty"
    booleans: "number", // "string" (default) | "number"
  },
  // Or supply a custom serializer replacing the built-in builder:
  // querySerializer: (query) => new URLSearchParams(...).toString(),
  resources: { users: { path: "/users" } },
});
```

Nested plain objects encode using bracket notation (`filter[role]=admin`), `Date` encodes as ISO-8601, and unsupported values (`NaN`, `Infinity`, symbols, functions, circular references, nesting beyond depth 64) throw `SerializationError`.

## 6. Response pipeline, `response.unwrap` / `parse` / `validate`, `schema.response`, and `source`

Configure response envelope extraction, parsing, and validation at root, resource, or operation level (most specific wins; pass `false` on a hook or transform rule to disable an inherited rule):

```ts
const api = defineApi<{ users: User }>()({
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

- `response.parse` and `schema.response` can be used together: `response.parse` runs before `onResponse`, and `schema.response` runs **after** `onResponse` and before final built-in structural/pagination checks.
- Use `emptyResponse` (`import { emptyResponse } from "apixa"`) as `schema: { response: emptyResponse }` to type empty/204/205 operations as `Promise<void>`.
- Invalid collection payloads (for example `getMany` or `findFirst` receiving a non-array) now throw `ResponseShapeError` instead of silently collapsing to `[]`; valid empty arrays remain valid.
- Key transforms accept `KeyTransformConfig` (`{ keys, exclude?, preserve?, maxDepth? }`) or `false` (to disable an inherited transform rule) and throw `TransformError` on cycles, excessive depth (default `64`), or key collisions.

## 7. Pagination (`paginationConfig`, operation `pagination`, and call `options.pagination`)

Pagination is configured on a resource via `paginationConfig` (inherited by `getAll`) or per operation via `pagination` on `getAll`, `getMany`, and declarative custom operations:

```ts
const api = defineApi<{ users: User }>()({
  baseURL: "https://api.example.com",
  resources: {
    users: {
      path: "/users",
      paginationConfig: { strategy: "page", preset: "laravel" },
      operations: {
        exportAll: { kind: "read", method: "GET", path: "/all", pagination: false },
      },
    },
  },
});

const page = await api.users.getAll({ pagination: { page: 2, pageSize: 25 } });
// Logical pagination keys are also accepted in options.query:
// await api.users.getAll({ query: { page: 2, pageSize: 25 } });
```

- **Strict key roles:** Resource definitions accept `paginationConfig` only (resource `pagination` is rejected with `ConfigError`). Operation definitions accept `pagination` only. Call options accept logical pagination keys in `options.pagination` or `options.query` (passing any logical key in both `options.pagination` and `options.query` throws `ValidationError`; passing `options.pagination` on a non-paginated operation throws `ConfigError`).
- Accepted forms: `true` (`"page"`), `"page"`, `"cursor"`, `"offset"`, preset shorthands (`"laravel"`, `"laravel-paginator"`, `"strapi"`, `"payload"`, `"nestjs"` — defaulting to `"page"`), `false` (disables resource pagination on `getAll`), or `{ strategy?, preset | fields | parseList, params }`.
- Operation-level `pagination` cleanly shadows resource-level `paginationConfig` (`pagination: false` opts `getAll` out; `pagination: true` reuses resource `paginationConfig` or defaults to `"page"`).
- `slice` uses strict `Array.prototype.slice` semantics on client-side lists and throws `ConfigError` if combined with `pagination`.
- New `"offset"` strategy, `pageBase`, `defaultPageSize`, `maxPageSize`, `buildRequest` and `parseList` with `{ status, headers, request }`.
- Result types: `PageResult` is the page contract (the old union is `PaginatedResult`); results gained optional metadata, so exact-type assertions need updating. Custom page/offset mappings no longer need a `total` unless they declare it. `laravel-paginator` cursor results include `previousCursor`.
- Paginated operations ignore a configured `response.unwrap` and reject non-JSON `responseType`.

## 8. Built-in `getMany`, `count`, retry/timeout, and per-call option boundaries (ADR-007)

- **`getMany(ids, options?)`:**
  - `getMany([])` short-circuits immediately with zero network or mock requests, returning `[]` (or `{ data: [], skipped: true, reason: "empty-ids", status: null, headers: null }` when `{ full: true }`).
  - Live responses enforce strict ID membership against the resource's `idKey` (default `"id"`): unexpected `extraIds`, `duplicateIds`, or items missing a string/number `[idKey]` throw `ResponseShapeError` (and non-paginated `getMany` also rejects `missingIds`, while paginated `getMany` allows page subsets of the requested IDs). Returned records are reordered to match input `ids` (or local `options.sortBy`).
  - Optional `options.sortBy` (`field` or `{ field, order?: "asc" | "desc", type?: "string" | "number" }`) sorts the returned batch locally in both live and mock execution without sending a query param.
- **`count(options?)`:** Normalizes non-negative safe integers, digit strings (`"42"`), and `{ count }`, `{ total }`, `{ data }`, `{ records }`, `{ quantity }`, `{ numberOfUsers }`, or `{ statistics: { count } }` envelopes (after `response.unwrap`), rejecting floats, `NaN`, negatives, or malformed objects with `ResponseShapeError`.
- **Retries and timeouts:**
  - Default retryable HTTP methods are `["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]` (`POST` and `PATCH` remain opt-in when `methods` is configured).
  - `retry` uses `count`, `delay`, `maxDelay`, `backoff: "exponential" | "linear"`, and `jitter: "full" | "equal" | false` (default `"equal"`; legacy `retries`, `baseDelayMs`, and `maxDelayMs` throw `ConfigError`).
  - `timeout` accepts `number` (total budget) or `{ total?: number, perAttempt?: number }`.
- **Per-call `RequestOptions` cleanup:**
  - `responseType` and `redirectOrigins` are operation-definition (and `ctx.request`) settings only and are rejected on per-call `RequestOptions` with `ConfigError`.
  - Per-call `maxResponseSize` may only tighten (narrow) an operation's configured `maxResponseSize`; attempting to exceed the operation limit throws `ConfigError`.

This is release-candidate stabilization. A merged PR, local verification and stable npm publication are separate events; no publication is performed by this work.
