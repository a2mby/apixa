# Changelog

## Unreleased

### Breaking

- `@apixa/mocking` — rename resource / `mockConfig` option `size` → `slice`. `slice` accepts a non-negative integer (first N rows) or `{ start, end }` (half-open). Overshooting the dataset returns all records; negatives and `end < start` throw `InvalidSliceError` (`INVALID_SLICE`) under `MockingErrors`.
- Removed `users-sample` dataset and `@apixa/mocking/data/users`. Use `users-mock` / `@apixa/mocking/data/users-mock` (`User` entity).

### Fixed

- Core `mockConfig.type: "users-mock"` now seeds the full 100-row dataset (was a 3-row browser stub).

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
