# `apixa/core`

Implementation: private workspace module `@apixa/core`. Public installation: `npm install apixa`.

TypeScript API client: `defineApi()`, default-first resource CRUD, Fetch transport, standardized errors.

## Custom operations

**Owns:** definitions, operations, request lifecycle, middleware, transforms, retry/timeout, errors,
type inference, operation metadata, and the `MockStore` execution bridge. **Imports:** nothing
(no React, TanStack Query, Mocking, or Node built-ins). See [architecture](../../docs/architecture.md#architecture-contract-v100).

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
  (`apixa/react` does this for mutation retries).
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

`ResourceExtensions` / `OperationExtensions` — Core owns `mock` / `slice` / `pagination` types and known `MockDatasetIds`. For named datasets (`mock: "<dataset-id>"`), install `apixa/mocking` and import `apixa/mocking/register` once before requesting data. Inline mock data and providers need no integration. A custom declarative operation can carry its own `mock` handler (`mock: ({ records, store, params, query, body, signal }) => result`) that runs only when the resource is mocked; see the `apixa/mocking` README.

## File uploads

Declare which entity fields hold files; writes then accept native `File` / `Blob` values and Core
sends `multipart/form-data` automatically (JSON stays the default when there are no files):

```ts
const api = defineApi<{ users: { path: "/users"; entity: User } }>()({
  baseURL: "https://api.example.com",
  resources: {
    users: { path: "/users", fileFields: ["avatar", "documents"] },
  },
});

await api.users.create({ name: "Ada", avatar: file, documents: [a, b] }); // multipart
await api.users.update("1", { name: "Ada L." }); // no binary values → JSON
const user = await api.users.getById("1"); // user.avatar: string
```

Use `fileFields: { avatar: { name: "profile_image" } }` for a different part name,
`multipart: { jsonFields, nulls, arrays }` for encoding overrides, and `dataFormat: "json" |
"multipart"` on an operation for backend quirks. Nested objects use `a[b]`, scalar arrays `tags[]`,
file lists repeat the field name. See `docs/architecture.md` ("File handling") for every rule.
Mocked resources keep uploaded bytes in a virtual file store: `mockFiles(api).list()`. A `FileList`
from an `<input>` must be converted first (`Array.from(input.files)`).

## File downloads and binary responses

A download is an ordinary operation. `responseType` (`"json"` default, `"text"`, `"blob"`,
`"arrayBuffer"`, `"stream"`) is declared on the operation and types the result; a per-call
`responseType` wins, and `{ full: true }` gives the `ApiResponse` with `status` and `headers`:

```ts
const api = defineApi<{ reports: { path: "/reports"; entity: Report } }>()({
  baseURL: "https://api.example.com",
  resources: {
    reports: {
      path: "/reports",
      operations: {
        download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
      },
    },
  },
});

const blob = await api.reports.download("1"); // Blob
const res = await api.reports.download("1", { full: true }); // ApiResponse<Blob>
parseContentDisposition(res.headers).filename; // string | undefined (never assumed)
res.headers.get("content-type"); // content type / length are plain headers
await api.reports.getById("1", { responseType: "arrayBuffer" }); // ArrayBuffer
```

Result types: `text` → `string`, `blob` → `Blob`, `arrayBuffer` → `ArrayBuffer`, `stream` →
`ReadableStream<Uint8Array> | null`. Metadata `response` in `defineApi<T>()` wins over the inferred
type; function operations use `ctx.request({ path, responseType: "blob" })` (also typed). Rules:
an unknown `responseType` is a `ConfigError`; binary data is never JSON-parsed, key-transformed or
shaped (`getAll` `slice`, `toArray`); a failed download is an `HttpError` whose `data` is the parsed
JSON/text body; an empty 204/205 gives `""` / an empty `Blob` / an empty `ArrayBuffer` for explicit
text/binary modes (`null` for JSON and `stream`). Abort and timeout cover the body read, and retries
never read a binary body that was not successful.

Mocked resources serve uploaded files from the virtual store, through a declarative operation:

```ts
download: {
  kind: "read", method: "GET", path: "/:id/file", responseType: "blob",
  mock: ({ params, store, files }) => files.get(store.get(params.id).photo).blob(),
},
```

`files` is a read-only view (`has`, `meta`, `get`, `list`; a missing file is `MOCK_NOT_FOUND`). The
result is coerced to `responseType` and the mock response carries `Content-Type`, `Content-Length`
and (for a `File`) `Content-Disposition`. Mocked `responseType: "stream"` is `MOCK_UNSUPPORTED`.
React hooks resolve unwrapped payloads (`full` is not available there): use the direct client for
headers. A `Blob` is not serializable, so it cannot cross a server/client or dehydration boundary.

## Errors

`ApiErrorCode`: `NETWORK` | `HTTP` | `PARSE` | `VALIDATION` | `TIMEOUT` | `ABORT` | `SERIALIZATION` (an unencodable body, such as binary values under `dataFormat: "json"`).  
`ApiError` has `code`, `retryable`, `attempt`. Guards: `isApiError`, `isHttpError`, `isTimeoutError`.

## Notes

- Operations return native `Promise<T>` (unwrap) unless `full: true`.
- No React / Next / TanStack Query in Core.
