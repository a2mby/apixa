# `@apixa/core`

TypeScript API client: `defineApi()`, default-first resource CRUD, Fetch transport, standardized errors.

## Custom operations

Every custom operation declares `kind: "read" | "write"`. Declarative operations also declare
an HTTP method; function operations use `{ kind, run }`:

```ts
operations: {
  stats: { kind: "read", method: "GET", path: "/stats" },
  archive: { kind: "write", run: (ctx, id: string) =>
    ctx.request({ method: "POST", path: `/${id}/archive` }) },
}
```

Built-ins inherit their fixed kind, including function overrides. GET, HEAD, and OPTIONS require
`read`; POST, PUT, PATCH, and DELETE require `write`. Core validates declarative operations at
API construction and every function `ctx.request()` before transport or mock dispatch.

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

`ResourceExtensions` / `OperationExtensions` — Core owns `mock` / `slice` / `pagination` types and known `MockDatasetIds`. For named datasets (`mock: "<dataset-id>"`), install `@apixa/mocking` and import `@apixa/mocking/register` once before requesting data. Inline mock data and providers need no integration.

## Errors

`ApiErrorCode`: `NETWORK` | `HTTP` | `PARSE` | `VALIDATION` | `TIMEOUT` | `ABORT`.  
`ApiError` has `code`, `retryable`, `attempt`. Guards: `isApiError`, `isHttpError`, `isTimeoutError`.

## Notes

- Operations return native `Promise<T>` (unwrap) unless `full: true`.
- No React / Next / TanStack Query in Core.
