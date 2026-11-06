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

## Idempotency keys

Opt in per write operation. Core sends one key per logical call — reused by its own transport
retries and by an error-middleware replay — in an `Idempotency-Key` header:

```ts
resources: {
  orders: {
    path: "/orders",
    operations: {
      create: { idempotency: true },
      refund: { kind: "write", method: "POST", path: "/:id/refund", idempotency: { header: "X-Idempotency-Key", generate: () => ulid() } },
    },
  },
}

await api.orders.create(body, { idempotencyKey: "checkout-42" }); // your own key (reuse it when you retry)
```

- Disabled by default; reads reject `idempotency` (TypeScript and `ConfigError`). An explicit
  `idempotencyKey` on an operation without the option is a `ConfigError`, not a silent drop.
- A header the caller already set wins over a generated key; middleware sees the key on
  `request.headers`.
- The default key is `crypto.randomUUID()`. `createIdempotencyKey(resource, name)` returns a fresh
  key from the operation's own generator for integrations that retry whole calls
  (`@apixa/tanstack-query` does this for mutation retries).
- Apixa only sends the key. Deduplication, persistence, and concurrent identical requests are the
  backend's job; a header alone does not guarantee exactly-once execution.
- Function operations (`{ kind, run }`) reject `idempotency` with a `ConfigError`; set the header
  yourself in `ctx.request({ headers: { "Idempotency-Key": key } })`.

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
