# Changelog

## Unreleased

### Added — mock handlers for custom declarative operations

- `@apixa/core` — a custom declarative operation accepts an optional `mock` handler,
  `({ records, store, params, query, body, signal }) => result` (sync or async), that defines its
  behavior on a **mocked** resource. It lives on the operation (no second registry), is typed from
  the resource's mock records, the operation path, and `defineApi<Meta>()` body/query/response, and
  is ignored on live resources. Without a handler a mocked custom operation still rejects with
  `MOCK_UNSUPPORTED`; it is never guessed from its URL. `store` is a small copy-in/copy-out view of
  the resource's own store (`get`, `exists`, `list`, `create`, `update`, `patch`, `delete`);
  `records` is a lazy snapshot. New types `OperationMockHandler`, `OperationMockContext`,
  `MockStoreHandle`. `mock` on a builtin or a `run` operation is a config error.
- `defineApi<T>()` with metadata operations plus a context-sensitive handler no longer reports the
  metadata operations as missing.
- `defineApis` keeps each backend's mock record and path-parameter types in handlers. Operation
  response metadata describes the raw handler result; Core applies response key transforms to the
  public result, so handlers do not need casts for transformed keys.
- A request aborted while an async mock provider is loading no longer starts its custom handler
  after loading completes.

### Fixed — Mocking stabilization for v1.0.0

- `@apixa/core` — a declarative custom operation on a mocked resource (`{ kind, method, path }`) is
  no longer guessed from its URL. `GET /stats` used to run `getById("stats")` and `DELETE /purge`
  used to delete the record `purge`; both now reject with `MOCK_UNSUPPORTED` naming the operation,
  and the store is untouched. Builtin overrides and function operations (`ctx.request`) are unchanged.
- `@apixa/core` — mock writes reject the keys `__proto__`, `constructor` and `prototype` at any
  depth (`MOCK_INVALID_INPUT`), and filters, `search`, `findFirst` and `getBy` read own properties
  only. `patch` with `{"__proto__": …}` used to change the stored row's prototype.
- `@apixa/mocking` — `@apixa/core` is now a **peer dependency** (`^0.1.0`) instead of a pinned
  dependency, so a second Core copy is no longer installed. `register` also stores its loader in a
  process-wide slot, so a duplicated Core still finds it.
- `@apixa/mocking` — `defineMockApi().getAll` now runs Core's engine (`runBuiltin`): same filters,
  paging and `slice` as a Core mock. See "Changed" for the behavior differences.
- `@apixa/mocking/node` — documented and tested from the packed package: it needs a caller-supplied
  root (`basePath` / `APIXA_DATASETS_DIR`); the not-found error says so.

### Changed — behavior differences to migrate

- `defineMockApi` `getAll(query)` takes **one flat object**: `page`/`pageSize`/`cursor` plus filter keys
  (before: only `{ page, pageSize }`; any other key threw `INVALID_PAGINATION`). Filters match
  flat keys exactly, arrays mean "any of".
- `defineMockApi` pagination envelope is `{ data, total, page, pageSize }`: **`previous` and `next`
  are removed**, and a page past the end is an **empty page** instead of `INVALID_PAGINATION`.
  Passing paging keys without `pagination` is ignored instead of throwing.
- `defineMockApi` `slice` now **caps the `getAll` list result** like a Core mock (`count`, `getById`
  and writes still see every record, and new ids continue after the full dataset). The old
  "start the store with a window" behavior is the new `seed: { limit?, offset? }` option.
- `defineMockApi` `pagination` also accepts `"page"` and `"cursor"` (`true` still means `"page"`).
- `defineMockApi` invalid paging values still use the `INVALID_PAGINATION` code.

### Added — Mocking

- `@apixa/mocking/datasets/<name>` for `users`, `products`, `companies`, `orders`, `posts` and
  `comments`: one dataset per module, so a bundler (and native Node) loads only that dataset. The
  barrel `@apixa/mocking/datasets` is unchanged; `loadDataset` is also exported from the root entry.
- `@apixa/core` exports `runBuiltin`, `applyResourceSliceToListResult` and the `BuiltinIntent`,
  `MockResult`, `PaginationMode` types for the shared mock engine.
- Verification: `pnpm typecheck` includes the tracked example, `pnpm verify:consumers` runs the
  packed-consumer checks, and `.github/workflows/ci.yml` runs build, typecheck, test and consumers.

### Performance — Mocking

- A paginated or filtered read copies only the returned page, not the whole dataset; working rows
  share objects with the seed until a write replaces them. 100,000 inline records: paged `getAll`
  169 ms → 0.04 ms, retained heap 73.3 → 41.3 MB. Named datasets: 0.28 → 0.17 MB per client.
  `search` over 100,000 rows is about 1.6 ms slower (own-property reads).

### Added — TanStack Query DX refinement

- `@apixa/core` — opt-in `idempotency` on write operations (`true` or `{ header, generate }`): one
  `Idempotency-Key` per logical call, reused by Core retries and an error-middleware replay;
  `options.idempotencyKey` supplies your own; reads reject it. New `createIdempotencyKey(resource,
name)`; operation metadata gains `idempotency`.
- `@apixa/tanstack-query` — `prefetch()`, `cache.get/set/remove`, and `cancel()` on query results
  and `useResource` (same keys and functions as the hook, no observers); infinite mode in
  `useResourceQuery` (`infinite: { initialPageParam, getNextPageParam, query | args, maxPages }`)
  on native `useInfiniteQuery`, with its own `"infinite"` key namespace; advanced
  `createResourceInfiniteQueryOptions`, `prefetchResourceQuery`, and
  `prefetchResourceInfiniteQuery` for server rendering.
- `@apixa/tanstack-query` — callable writes expose their native mutation state
  (`users.create.isPending`, `.data`, `.error`, `.variables`, …) as live getters over the same
  lazy observer as `states.create`.
- `@apixa/tanstack-query` — declarative `optimistic: { detail + update | list | targets }` per
  write: concurrency-safe layers (a failure removes only its own change; refetches during pending
  calls keep them), rollback after unmount, native callback order preserved. TanStack mutation
  retries reuse one idempotency key per call.

### Fixed — TanStack Query DX refinement

- `@apixa/tanstack-query` — a fetch sent before a write reached the server could land after the
  write succeeded and replace confirmed data: optimistic entries not covered by the mutation's
  invalidation kept the stale response, and an in-flight fetch of an inactive entry cleared its
  invalid mark with old data. Such fetches are now restarted (native `cancelRefetch`) when the
  write succeeds.

### Changed — TanStack Query DX refinement

- `invalidateLists()` and `invalidate: "lists"` also cover infinite lists. Mutation invalidation
  restarts a fetch already running for an inactive matching entry. Reads named `prefetch`,
  `cache`, `cancel`, or a native infinite-result field are only reachable through `operations`.

### Removed — `@apixa/mocking`

- **Breaking:** the `@apixa/mocking/data` and `@apixa/mocking/data/users-mock` entry points are removed. Import records and entity types (`User`, `Product`, …) from `@apixa/mocking/datasets`. `@apixa/mocking/register` and `@apixa/mocking/node` stay as internal tooling.

### Added — v1.0.0 TanStack integration (Core classification, mutations, facade)

- `@apixa/core` — **breaking:** every custom operation must declare `kind: "read" | "write"`
  (no implicit `"write"` default); function operations use `{ kind, run }` and the bare-function
  shorthand is rejected for custom names. Builtins keep their canonical kind and reject any
  explicit `kind`. Kind and HTTP method must agree (GET/HEAD/OPTIONS → read; POST/PUT/PATCH/DELETE
  → write), validated at construction for declarative operations and per `ctx.request()` for
  function operations, with `ConfigError` at runtime and compile-time checks for literals. Migrate
  `archive: { method: "POST", … }` to `archive: { kind: "write", method: "POST", … }` and
  `stats: async (ctx) => …` to `stats: { kind: "read", run: async (ctx) => … }`.
  Every resource client exposes non-enumerable, typed operation metadata
  (`OPERATION_METADATA`, `getOperationMetadata`, `OperationKindsOf`) with `kind`, `builtin`,
  `implementation`, and the `RequestOptions` argument position. Execution is unchanged.
- `@apixa/tanstack-query` — `useResourceMutation(resource, { queryKey, mutations })` inherits every
  enabled Core operation (custom included) as a directly callable method with Core's exact
  arguments and result, native per-operation `states`, all native `UseMutationOptions` per
  operation, client-only operations via `mutationFn`, and typed invalidation (`"all"` default for
  writes, `"lists"`, details, callback, `false`). Backed by lazily created native
  `MutationObserver`s behind one external store. Writes only: reads are not exposed, and the
  single-operation overload `useResourceMutation(resource, "create", options)` is removed (use
  native `useMutation` with a Core operation for a standalone `UseMutationResult`).
- `@apixa/tanstack-query` — `useResource(resource, { queryKey, scope, query, mutations })`: a thin
  composition of both hooks (`mutations` is now top-level; the nested `mutation: { mutations }`
  form is removed). It is a facade
  over both hooks with flat query state, flat operations, `operations.*` for every operation,
  `states.*` for writes, and read/write routing from Core's classification.
- `useResourceQuery` inherits every enabled read (builtin and `kind: "read"`) as a cached
  imperative call plus `operations.*`, and supports operation-only resources without `getAll`.

### Fixed — v1.0.0 TanStack integration

- `useResourceQuery` no longer spreads TanStack's tracked result: components re-render only for
  fields they read (render-count parity with `useQuery`).
- Signals bind at Core's recorded `RequestOptions` position instead of guessing by property names;
  function operations (custom or overriding a builtin) never get an injected argument.
- Equivalent detail requests share one cache entry, and `invalidateDetail(id)` also invalidates
  keyed detail variants.

### Added — v1.0.0 Query workstream

- `useResourceQuery` now accepts the installed TanStack v5 query options, preserves the complete
  native result surface, and infers `select` and defined `initialData` from Core resource methods.
- Explicit read selectors cover the nine built-in reads and declared custom reads, with typed
  argument tuples, response types, signal binding, and operation-specific cache keys.
- `@apixa/tanstack-query/advanced` exports `createResourceQueryOptions` for native `useQuery`,
  `useQueries`, `useSuspenseQuery`, prefetching, and server hydration. The query controller adds
  list/detail invalidation and QueryClient-backed cache actions.
- The main package build retains `"use client"`; the advanced factory entry remains usable in
  server code. Added a runnable App Router hydration example and a reproducible query baseline.

### Changed — breaking (`@apixa/tanstack-query`, TanStack overhaul step 1)

- `useResourceQuery` is now query-only: it no longer returns `create`, `update`, `delete`, or
  `mutations`, no longer accepts the `mutations` option, and mounts no `useMutation` observers.
  It keeps `data`, list state, `query`, `getById`, `refetch`, `invalidate`, `keys`, and
  `controller` (now the query controller).
- Run writes with `useResourceMutation(resource, { queryKey })` and call the operations directly —
  e.g. `users.create(body)`, `users.update(id, body)`. On success it awaits invalidation of every
  query under the resource key, then runs consumer `onSuccess`. (The intermediate
  single-operation `"create"` form was removed before release; `readOperations` is also removed —
  declare `kind: "read"` in Core.)
- `controller.ts` is split into `createResourceQueryController` and
  `createResourceMutationController` (plus `operationMutationOptions`), exported from
  `@apixa/tanstack-query/advanced`. `createResourceController` remains as a compatibility
  composition of both. `ResourceKeyFactory.mutation` accepts any operation name.

### Fixed (v0.11.0)

- `@apixa/core` — a malformed/truncated body declared `application/json` now throws `ParseError`
  instead of silently resolving as `status: 200, body: null`.
- `@apixa/core` — a failed-attempt retry decision (`shouldRetry`) is computed once per attempt, not
  twice; `HttpError.retryable` matches the actual retry decision.
- (Also present since v0.10.0 land where shared files already included them:) composed builtins
  honor resolved `getById`/`getAll`; mock bridge clones on read and simulates extended routes;
  `defineApi` rejects a missing resource `path`.

### Added (v0.11.0)

- `@apixa/tanstack-query` — `useResourceMutation(resource, opName, options)` for builtins/custom
  ops that `useResourceQuery` does not wire individually (invalidate-on-success default).
- Documented: opt-in `pagination?: "page" | "cursor"` and `readOnly?: boolean` (behavior already in
  Core from the v0.10.0 land via shared files).
- `docs/study-guide.md` — internal analysis notes for the post-v0.10 hardening pass.

### Added (v0.10.0)

- `@apixa/core` — a resource's `operations` accepts a config object, a function, or `false` per
  key:
  - **Function** — `(ctx, ...args) => Promise<T>`, called exactly like a generated operation
    (`api.resource.<name>(...)`). `ctx.request(init)` runs through Core's normal pipeline
    (headers, retry, middleware, error classification).
  - **`false`** — removes a builtin from the generated client. Removing an inactive name is a
    no-op.
  - `operations` suggests the 16 known operation names for autocomplete while still accepting
    arbitrary custom keys.
- 11 new builtins, **always-on** for any resource with a `path` — same default-first treatment
  as the original 5 since v0.2.0, no `operations` entry needed: `getBySlug`, `patch`, `upsert`,
  `count`, `search`, `bulkCreate`, `bulkDelete`, `getMany`, `exists`, `findFirst`, `getBy`.
  `exists` / `findFirst` / `getMany` / `getBy` are composed over `getById` / `getAll` — no new
  backend route assumed. `getBy(fieldOrPath, value)` is a general lookup escape hatch: a
  `:placeholder` interpolates, otherwise the value is appended as a path segment.
- `@apixa/mocking` — the same always-on add / remove / override surface on mock resources (`mock:
"<dataset-id>"` and `defineMockApi`), implemented as in-memory data operations.
  `MockOperationContext` (`ctx.rows()`, `ctx.defaults`) lets a custom mock operation read/write
  the resource's rows or reuse the default CRUD.

### Breaking (v0.9.0)

- `@apixa/core` / `@apixa/mocking` — resource mocking is now `mock: "<dataset-id>"` (string). Removed `mock: true` / `false` and `mockConfig`. Put `pagination` next to `path` / `slice` / `mock`.
- Core `MockDatasetIds` lists known catalog ids so `mock` autocompletes without importing `@apixa/mocking`.
- `defineMockApi` accepts a dataset id string per resource (`users: "users-mock"`) or the existing `{ type, slice?, pagination? }` object.

### Breaking (prior unreleased)

- `@apixa/core` — rename builtin operation `getByID` → `getById` so `defineApi` matches `defineMockApi`. Call sites and `operations` overrides must use `getById` (no alias).
- `@apixa/mocking` — rename resource option `size` → `slice`. `slice` accepts a non-negative integer (first N rows) or `{ start, end }` (half-open). Overshooting the dataset returns all records; negatives and `end < start` throw `InvalidSliceError` (`INVALID_SLICE`) under `MockingErrors`.
- `@apixa/core` — `slice`, `mock`, and `pagination` are first-class on `ResourceExtensions` (no `@apixa/mocking` import required for types/autocomplete). `slice` caps `getAll` array results; with `mock` set the optional mocking peer also uses it as the seed window.
- Removed `users-sample` dataset and `@apixa/mocking/data/users`. Use `users-mock` / `@apixa/mocking/data/users-mock` (`User` entity).

### Fixed

- Core `mock: "users-mock"` now seeds the full 100-row dataset (was a 3-row browser stub).

## 0.8.0

### Added

- **`@apixa/tanstack-query`** — optional TanStack Query integration.
  - Primary API: `useResourceQuery(resource, { queryKey, scope?, query?, … })`.
  - One object: list query state (`data`, `isPending`, `isLoading`, `isFetching`, `error`, …), Promise ops (`create` / `update` / `delete` / `getById`), `invalidate` / `refetch` / `keys`, and `mutations.create|update|delete`.
  - Default cache: invalidate list queries after successful mutations; seed/remove detail keys.
  - Types inferred from the Apixa resource client.
  - Escape hatch: `@apixa/tanstack-query/advanced` (`createResourceController`, keys, cache helpers).
- Next example migrated to `useResourceQuery`.

### Notes

- List loading state never includes mutation pending — use `mutations.*.isPending`.
- `patch-list`, optimistic helpers, and infinite-query helpers are **not** in 0.8.0.
- `@apixa/core` remains free of React / TanStack Query.

## 0.7.0

### Breaking

- **Middleware:** `next()` returns `Promise<ApiResponse<unknown>>` and may be called more than once. Context is `{ request, response?, attempt, meta }`. Hooks must `return next()` (or another `ApiResponse`), not arbitrary data.
- **Mock keys left Core types:** `mock` / `mockConfig` are no longer on Core’s base resource input. Import `@apixa/mocking` (or `/data` / `/register`) so `declare module` adds them via `ResourceExtensions`.
- **`hasBody` default:** derived from HTTP method (`POST` / `PUT` / `PATCH` → true). Convention-name defaults removed; set `hasBody` only to override.
- **Error codes:** stable `ApiErrorCode` values are now `NETWORK` | `HTTP` | `PARSE` | `VALIDATION` | `TIMEOUT` | `ABORT` (was `*_ERROR` strings).

### Added

- Types: tighter `ApiState`, resource+op path-param concat, `list` / `query` on `ResourceState`, `ResourceExtensions` / `OperationExtensions`, `CallResult` / `full` options.
- Root `queryArrayFormat` / `querySerializer`; body passthrough for `FormData` / `Blob` / etc.
- `RequestOptions`: `retry`, `responseType`, `meta`, `full`.
- Retry: `respectRetryAfter`, `shouldRetry`, `onRetry`.
- Errors: `retryable` / `attempt` on `ApiError`, `HttpError<D>`, `isHttpError`, `isTimeoutError`.

### Migration

1. Middleware: `return await next()`; use `res.status` / `res.data` instead of thrown HTTP for soft handling; call `next()` again to retry a transport attempt.
2. Mocking: ensure `@apixa/mocking` is imported (types + runtime) wherever `mock` / `mockConfig` appear.
3. Custom ops that POST without a body: set `hasBody: false`.
4. Replace checks for `error.code === "NETWORK_ERROR"` (etc.) with `"NETWORK"` / `"HTTP"` / …

## 0.6.0

### Added

- First-class cancel / timeout on operation call options (`signal`, `timeout`) with documented `AbortError` / `TimeoutError`.
- Opt-in `retry` on `defineApi` (resource / operation overrides; `false` disables). Safe defaults: `GET` / `HEAD`, network + `408` / `429` / `5xx`, exponential backoff.
- Thin ordered `middleware` hooks (`ctx` + `next`) wrapping the full retry loop; header mutation before transport.
- Public types: `RetryConfig`, `Middleware`, `MiddlewareContext`, `MiddlewareNext`.

### Notes

- No new packages; Fetch remains inside Core. Schema validation, client/server packages, and live pagination conventions remain planned.

## Unreleased (post-0.5.0 mocking follow-ups)

### Added

- `@apixa/mocking` — `defineMockApi()`: standalone, in-memory mock API seeded from local datasets (`type`, `size`, `pagination`); typed `getAll` / `getById` / `create` / `update` / `patch` / `delete`; no `defineApi()`, no network.
- `MockApiError` with stable `code`s (`INVALID_CONFIG`, `UNKNOWN_DATASET`, `NOT_FOUND`, `DUPLICATE_ID`, `INVALID_INPUT`, `INVALID_PAGINATION`).
- `@apixa/mocking/data` — typed, read-only records for the small synthetic datasets, plus entity types for all 16 datasets `defineMockApi()` can load.
- `@apixa/mocking/register` — stable entry for Core’s optional peer lazy-load (processor + built-in presets).
- Core optional peer `@apixa/mocking`: `defineApi` with `mock` / `mockConfig` works without a side-effect `import "@apixa/mocking"`.

### Removed

- `createMockTransport()` and its options type (superseded by `defineMockApi()` / resource-level `mock`).
- `createSelectiveMockTransport` from the public exports (needed an unexported `MockStore`; still used internally by the Core bridge).
- Required side-effect `import "@apixa/mocking"` for resource-level mocks (lazy peer load replaces it).

### Notes

- Not loadable through `defineMockApi()`: `states-csc`, `states-parseapi`, `counties-parseapi` (each >500 KB; the two parseapi sets also have non-unique id fields).

## 0.5.0

### Added

- `@apixa/mocking` — `loadDataset`, `listDatasets`, `createMockTransport` (injectable Core `Transport`).
- Resource-level `mock` / `mockConfig` on Core `defineApi` via `registerDefineApiProcessor` (behavior owned by `@apixa/mocking`).
- Typed presets `@apixa/mocking/data/users` and `data/users-mock`.
- Local version-controlled datasets under `datasets/<domain>/<id>/` (`meta.json` + `data.json`) with `manifest.json` provenance.
- Imported CC0 / ODbL reference geography sets; deterministic synthetic users/products/orders/social (Faker seed).
- Sample `users-sample` dataset for demos and the Next example.
- `pnpm datasets:build` to regenerate the collection from the fixed source URL list.

### Removed

- FastAPI `backend/` and platform `run-backend` / `stop-backend` / `restart-backend` scripts.
- Happy-path dependency on `127.0.0.1:8787` in the Next / basic examples.

### Notes

- Core production Fetch path is unchanged; no Core `mocks` product API.
- A future online dataset catalog is planned only — not implemented.

## 0.4.0

### Breaking

- Removed `type()`, `Type`, and `Infer` from `@apixa/core`.
- Typed payloads use a Zustand-style resource-only state: `defineApi<AppApi>()({ … })`.
- Developer state declares `path` + `entity` only — not `create` / `update` / root `baseURL`.
- `create` / `update` bodies are derived as `Omit<Entity, "id">` / `Partial<Entity>`.
- Runtime `operations` are value-only (`method`, `path`, `headers`, `timeout`, `hasBody`).

### Added

- `BuiltinHeaders` for common header keys plus a custom-header escape hatch (types only).
- `ApiState`, `ApiInput`, `ResourceState`, and `OperationState` for the state-typing model.

## 0.3.0

### Breaking

- Operation `body` and `response` markers must use `type<T>()` from `@apixa/core`.
  `{} as User` (and other non-`Type` values) no longer type-check on those fields.

### Added

- `type<T>()`, `Type<T>`, and `Infer<M>` for branded per-operation markers.
- Inference unwraps markers so `response: type<User[]>()` yields `Promise<User[]>`.

### Notes

- **Superseded by 0.4.0** — `type()` was removed in favor of `defineApi<T>()`.
