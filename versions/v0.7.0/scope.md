# v0.7.0 — Scope

## In scope

### 1. Types cleanup

- `ApiState = Record<string, ResourceState>` (stop collapsing values to `unknown`)
- Resource path params must count: concatenate `ResourcePath<R>` + op path before `PathArity` / `PathParamsOf`
- Add `list?` and `query?` to `ResourceState`; `getAll` uses `ListOf<R>` (default `Entity[]`) and `QueryOf<R>`
- Delete `RuntimeOperationValue`, `ResourceDefinition`, and the unused generic on `ResourceRuntimeInput`; reuse `OperationDefinition`
- Replace `BuiltinHeaders | HeadersInitLike` with `HeadersInitLike` only (keep `BuiltinHeaders` as the typed bag under `HeadersInitLike` if already defined)
- `ApiClient<T>`: drop non-resource keys via `as` remapping instead of mapping to `never`

### 2. Runtime behavior

- `hasBody` defaults by method (`POST` / `PUT` / `PATCH` = true); keep `hasBody` only as an override
- Pass through `FormData` / `Blob` / `URLSearchParams` / `ArrayBuffer` / `string` bodies as-is; JSON-encode plain objects only
- Root config: `queryArrayFormat?: "repeat" | "comma" | "brackets"` (default `"repeat"`) and `querySerializer?: (q) => string`

### 3. RequestOptions additions

- `retry?: RetryConfig | false`
- `responseType?: "json" | "text" | "blob" | "arrayBuffer" | "stream"`
- `meta?: Record<string, unknown>`
- `full?: boolean` → returns `ApiResponse<T>` instead of `T` (typed via `CallResult<R, O>`)

### 4. Middleware (breaking)

- `MiddlewareContext`: `{ request, response?, attempt, meta }`
- `next(): Promise<ApiResponse<unknown>>`, safely **re-callable** (e.g. refresh then retry)
- Middleware returns `Promise<ApiResponse<unknown>>`

### 5. Retry

- `respectRetryAfter` (default `true`)
- `shouldRetry(ctx)`, `onRetry(ctx)` on `RetryConfig`

### 6. Plugin seams (breaking)

- Empty interfaces `ResourceExtensions` and `OperationExtensions`
- `ResourceRuntimeInput = { … } & ResourceExtensions`; operations use `OperationDefinition & OperationExtensions`
- Remove `mock` and `mockConfig` from Core types; `@apixa/mocking` adds them via `declare module "@apixa/core"`
- Keep `registerDefineApiProcessor` as the hook

### 7. Errors

- `ApiErrorCode = "NETWORK" | "HTTP" | "PARSE" | "VALIDATION" | "TIMEOUT" | "ABORT"`
- `ApiError` gets `code`, `retryable`, `attempt`
- `HttpError<D = unknown>` with typed `data`
- Export `isHttpError`, `isTimeoutError`

### Workspace deliverables

- Reshape Core; update `@apixa/mocking` for augmentation + any processor/bridge fallout
- Update **existing** tests; add tests **only** for new behavior
- CHANGELOG with breaking changes + short migration note
- Living docs / story when done; Next example only if required for honesty (implemented API)

## Out of scope

| Item                                      | Why                |
| ----------------------------------------- | ------------------ |
| Auth / cache / validation packages        | Separate later     |
| Pagination / filter / sort helpers        | Separate later     |
| `@apixa/client` / `@apixa/server`         | Env packages later |
| `@apixa/tanstack-query` / OpenAPI         | Integrations later |
| Features not listed above                 | Explicit freeze    |
| Drive-by refactors unrelated to this list | Minimal code       |

## Constraints (non-negotiable)

- No React, Next.js, or TanStack Query in Core dependencies.
- No custom Promise wrappers.
- No new packages under `packages/` for this milestone.
- Do not bake schema / auth / cache into Core.
- Docs honest: planned ≠ implemented; CHANGELOG names breakages.
