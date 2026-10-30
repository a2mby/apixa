# `@apixa/core`

TypeScript API client: `defineApi()`, default-first resource CRUD, Fetch transport, standardized errors.

## Request options

```ts
await api.users.getAll({
  query: { active: true },
  signal,
  timeout: 5_000,
  retry: { retries: 1 },
  meta: { reason: "warmup" },
  full: true, // → ApiResponse<T>
  responseType: "json",
});
```

## Retries

Opt-in `retry` on api / resource / operation / call. Defaults: methods `GET`/`HEAD`, status `408`/`429`/`5xx`, exponential backoff. Also: `respectRetryAfter`, `shouldRetry(ctx)`, `onRetry(ctx)`.

## Middleware

```ts
const refresh: Middleware = async (ctx, next) => {
  let res = await next(); // ApiResponse — may call again
  if (res.status === 401) res = await next();
  return res;
};
```

Context: `{ request, response?, attempt, meta }`.

## Plugin seams

Empty `ResourceExtensions` / `OperationExtensions` — integrations augment via `declare module "@apixa/core"`. Resource `mock` / `mockConfig` live in `@apixa/mocking`.

## Errors

`ApiErrorCode`: `NETWORK` | `HTTP` | `PARSE` | `VALIDATION` | `TIMEOUT` | `ABORT`.  
`ApiError` has `code`, `retryable`, `attempt`. Guards: `isApiError`, `isHttpError`, `isTimeoutError`.

## Notes

- Operations return native `Promise<T>` (unwrap) unless `full: true`.
- No React / Next / TanStack Query in Core.
