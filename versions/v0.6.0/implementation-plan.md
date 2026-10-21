# v0.6.0 — Implementation plan

Smallest path to Core request reliability. Reshape the existing pipeline; do not add packages.

## Design decisions to lock while coding

1. **Call-site options stay on `RequestOptions`:** Keep `signal` / `timeout` (already wired). Document them; add tests. No second options bag.
2. **Retry config name:** Prefer root `retry?: false | RetryConfig` on `defineApi` (and the same key on resource / operation if cheap). Default: no retries unless configured (or a documented safe default — prefer **opt-in**).
3. **What retries:** Network / transport failures + HTTP `408`, `429`, `500`–`599` by default when enabled. Never retry after `AbortError`. Never retry methods outside an allow-list (default `GET`; optional `HEAD`).
4. **Backoff:** Simple exponential with cap (e.g. `baseMs * 2^attempt`, max cap) + optional jitter; expose `retries`, `baseDelayMs`, `maxDelayMs` (names flexible).
5. **Middleware shape:** Ordered `middleware?: Middleware[]` where  
   `type Middleware = (ctx, next) => Promise<unknown>`  
   `ctx` exposes at least the built `RequestConfig` (mutable headers) and maybe attempt index for retries. Prefer running middleware **around** each transport attempt or **once per logical call** — lock **once per logical call, retries inside `next`** so middleware does not re-run auth noise per attempt unless we document otherwise. Recommendation: **middleware wraps the whole execute (including retry loop)**.
6. **Errors:** Keep `AbortError` / `TimeoutError`; ensure retry exhaustion still throws the last meaningful error (`HttpError` / `NetworkError` / `ApiError`).
7. **Mocking:** Untouched product boundary. Fake `Transport` in tests only.

## Target developer surface (illustrative)

```ts
const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  timeout: 10_000,
  retry: {
    retries: 2,
    methods: ["GET"],
    statusCodes: [408, 429, 500, 502, 503, 504],
    baseDelayMs: 200,
  },
  middleware: [
    async (ctx, next) => {
      ctx.request.headers = { ...ctx.request.headers, "X-Trace": "1" };
      try {
        return await next();
      } catch (err) {
        // observe / rethrow
        throw err;
      }
    },
  ],
  users: { path: "/users" },
});

await api.users.getAll({ signal: controller.signal, timeout: 5_000 });
```

Exact type names may differ; document the final shape in Core README.

## Ordered steps

### 1. Freeze contract pointers (this kickoff) — done

- `versions/README.md`, `docs/context.md` banner, `docs/roadmap.md`, `docs/story.md` kickoff

### 2. Document + harden abort / timeout — done

- `classify-error.ts` + fake transport abort race; tests for `AbortError` / `TimeoutError`

### 3. Add `RetryConfig` types + resolution — done

- Types + `resolveRetryConfig`; api / resource / operation precedence

### 4. Implement retry loop in execute — done

- `request/retry.ts` + loop in `execute.ts` (abortable backoff)

### 5. Thin middleware API — done

- `request/middleware.ts`; wraps full retry loop; public exports

### 6. Tests — done

- `tests/core/reliability.test.ts` (abort, timeout, retry, middleware)

### 7. Docs honesty pass — done

- Core README, root README, CHANGELOG, living docs, story completion
- Next abort demo waived (optional)

## Explicit non-steps

- Do not create `packages/client`, `server`, `tanstack-query`, `openapi`, or `transport-fetch`.
- Do not add Zod/Valibot or schema validation hooks.
- Do not implement live pagination / filter / sort conventions.
- Do not build a full auth or logging product.
- Do not rewrite frozen v0.1–v0.5 folders for features.
- Do not add React or TanStack Query to Core.

## Suggested file touch list

| Path                                       | Action                                        |
| ------------------------------------------ | --------------------------------------------- |
| `packages/core/src/request/execute.ts`     | Retry loop + middleware composition           |
| `packages/core/src/request/retry.ts`       | New helper (if extracted)                     |
| `packages/core/src/request/middleware.ts`  | New thin middleware compose                   |
| `packages/core/src/types/definition.ts`    | `retry`, middleware types on config           |
| `packages/core/src/types/transport.ts`     | Keep / extend `RequestOptions` docs surface   |
| `packages/core/src/http/timeout.ts`        | Keep; fix edge cases if tests demand          |
| `packages/core/src/api/define-api.ts`      | Pass through new root keys                    |
| `packages/core/src/index.ts`               | Export new public types                       |
| `packages/core/README.md`                  | Document abort / timeout / retry / middleware |
| `tests/core/**`                            | New reliability cases                         |
| `CHANGELOG.md`                             | v0.6.0 notes                                  |
| `docs/context.md` / `docs/architecture.md` | Mark reliability as implemented when done     |
| `docs/story.md`                            | Kickoff + completion                          |

## Done when

All items in [acceptance-criteria.md](./acceptance-criteria.md) pass.
