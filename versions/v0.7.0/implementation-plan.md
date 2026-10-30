# v0.7.0 — Implementation plan

Smallest path to a thin, plugin-ready Core. Reshape existing files; no new packages. Update existing tests; add tests only for new behavior.

## Design decisions to lock while coding

1. **Path concat:** `EffectivePath` / call arity use `` `${ResourcePath<R>}${OpPath}` `` (normalize slashes) so `/orgs/:orgId` + `/:id` yields two params.
2. **ListOf / QueryOf:** `ListOf<R> = R extends { list: infer L } ? L : EntityOf<R>[]`; `QueryOf` similarly from `query?` else `QueryParams`.
3. **hasBody default:** From resolved HTTP method — `POST`/`PUT`/`PATCH` → true; others false unless `hasBody` override set.
4. **Body serialize:** Detect `FormData`, `Blob`, `URLSearchParams`, `ArrayBuffer` / `ArrayBufferView`, `string` → pass through; else `JSON.stringify` for plain objects; `undefined`/null → no body.
5. **Query:** Default `queryArrayFormat: "repeat"`; custom `querySerializer` replaces Core’s builder when provided.
6. **full / CallResult:** Operation fn return type is `CallResult` — `O extends { full: true }` via options → `Promise<ApiResponse<T>>`, else `Promise<T>`. Prefer conditional on the `options` generic if TS allows; otherwise overload or options-driven conditional type.
7. **Middleware:** Compose so each `next()` re-enters the remaining chain + transport attempt (safe re-call). Context carries `attempt`, mutable `meta`, optional last `response`.
8. **Retry hooks:** After building retry decision, call `shouldRetry?.(ctx)` if present (can override); `onRetry?.(ctx)` before delay; honor `Retry-After` when `respectRetryAfter !== false`.
9. **Plugin seams:** Core exports empty `interface ResourceExtensions {}` / `OperationExtensions {}`. Mocking augments `ResourceExtensions` with `mock?` / `mockConfig?`. Remove Core’s `ResourceMockConfigInput` from inference if it only existed for mock keys (or keep type in mocking only).
10. **Error codes:** Stable string union; set `retryable` consistently with retry policy defaults; `attempt` on thrown errors after retries.

## Ordered steps

### 1. Freeze contract pointers (this kickoff) — done

### 2. Types cleanup — done

### 3. Plugin seams + mocking augmentation — done

### 4. Runtime: hasBody, body serialize, query format — done

### 5. RequestOptions: retry, responseType, meta, full — done

### 6. Middleware breaking reshape — done

### 7. Retry: respectRetryAfter, shouldRetry, onRetry — done

### 8. Errors reshape — done

### 9. Tests + example honesty — done (`tests/core/v070-thin-core.test.ts` + suite green)

### 10. Docs + CHANGELOG migration — done

## Explicit non-steps

- Do not add auth, cache, validation, or pagination helper packages.
- Do not add client/server/tanstack/openapi packages.
- Do not expand scope beyond [scope.md](./scope.md).
- Do not rewrite frozen v0.1–v0.6 feature intent.

## Suggested file touch list

| Path                                  | Action                                           |
| ------------------------------------- | ------------------------------------------------ |
| `packages/core/src/types/*`           | Types cleanup, seams, options, middleware, retry |
| `packages/core/src/request/*`         | execute, middleware, retry, classify             |
| `packages/core/src/http/*`            | body passthrough, query formats                  |
| `packages/core/src/operation/*`       | hasBody default, create-fn options               |
| `packages/core/src/errors/*`          | codes, guards, HttpError generic                 |
| `packages/core/src/api/*`             | root query config; peer-mocking if needed        |
| `packages/core/src/index.ts`          | exports                                          |
| `packages/mocking/**`                 | `declare module` for mock keys; fix tests        |
| `tests/core/**`, `tests/mocking/**`   | update + minimal new cases                       |
| `examples/next/lib/api.ts`            | only if types break mock usage                   |
| `CHANGELOG.md`, `README.md`, `docs/*` | honesty + migration                              |

## Done when

All items in [acceptance-criteria.md](./acceptance-criteria.md) pass.
