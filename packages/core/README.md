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
const refresh: MiddlewareHooks = {
  onError: async (error, ctx) => {
    if (isHttpError(error) && error.status === 401 && ctx.replay) {
      await refreshSession();
      return ctx.replay();
    }
  },
};
```

Configure `middleware: [refresh]` on the API, resource, or operation layer. Each entry may provide `onRequest(request)`, `onResponse(response)`, and/or `onError(error, { request, replay })`.

## Response processing, query options, transforms, and pagination

- **`query` options**: configure `{ arrays, nulls, skipUndefined, serialize }` on API, resource, or operation layers (precedence: call > operation > resource > API).
- **`response` processing**: configure `{ unwrap, parse, validate }` on API, resource, or operation layers (`false` disables an inherited hook). Builtin collection responses reject invalid shapes with `ResponseShapeError`; `ApiResponse.source` preserves the raw payload when `{ full: true }` is used.
- **`transforms`**: configure `transforms: { request: { keys, exclude, preserve, maxDepth }, response: { keys, exclude, preserve, maxDepth } }`.
- **`pagination`**: declare `"page"`, `"cursor"`, `false` (shadow/disable per operation), or `{ type, preset | fields | parseList, params }` for live backends (`laravel`, `laravel-paginator`, `strapi`, `payload`, `nestjs`).

## Plugin seams

`ResourceExtensions` / `OperationExtensions` — Core owns `mock` / `slice` / `pagination` types and known `MockDatasetIds`. For named datasets (`mock: "<dataset-id>"`), use `apixa/mocking` and import `apixa/mocking/register` once before requesting data. Inline mock data and providers need no integration. A custom declarative operation can carry its own `mock` handler (`mock: ({ records, store, params, query, body, signal }) => result`) that runs only when the resource is mocked; see the `apixa/mocking` README.

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
await api.users.update("1", { body: { name: "Ada L." } }); // no binary values → JSON
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

const blob = await api.reports.download({ params: { id: "1" } }); // Blob
const res = await api.reports.download({ params: { id: "1" }, full: true }); // ApiResponse<Blob>
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

## Transfer progress, streaming and cancellation

`onTransfer` is optional and typed everywhere a call takes options. Without it nothing is wrapped:

```ts
const blob = await api.reports.download({
  params: { id: "1" },
  signal,
  onTransfer(event) {
    if (event.phase === "unsupported") return console.log(event.direction, event.reason);
    // event.direction: "upload" | "download"; event.attempt: 0-based retry attempt
    // event.loaded: bytes so far; event.total: number | undefined (never estimated)
    if (event.phase === "progress" && event.total) setPercent((event.loaded / event.total) * 100);
    if (event.phase === "error") console.log(event.error, event.willRetry);
  },
});
```

Per direction and attempt: `start`, `progress`\*, then `complete`, `error` or `abort` (a timeout is an
`error` with `TimeoutError`; a caller cancel is `abort`). A retry starts a new sequence at `loaded: 0`.
`complete` means the body was fully consumed, not that a server processed it. Upload `loaded` is the
bytes handed to the network stack, never an acknowledgment.

What is observable depends on the runtime; Apixa reports `unsupported` instead of faking it
(`detectTransferSupport()` tells you in advance):

| Case                                           | Node / Vercel Edge | Chromium                                     | workerd       |
| ---------------------------------------------- | ------------------ | -------------------------------------------- | ------------- |
| Download progress (all `responseType`s)        | yes                | yes                                          | yes           |
| Upload of `Blob` / `File` / `FormData` / bytes | yes                | `unsupported` (Content-Length cannot be set) | `unsupported` |
| Upload of a `ReadableStream` body              | yes (chunked)      | needs HTTP/2+ (else a `NetworkError`)        | `unsupported` |

Observation never changes the wire: Blob and multipart bodies keep their `Content-Length` and
boundary, and a runtime that cannot guarantee that sends the body untouched. A download `total` is
only a finite `Content-Length` on an uncompressed response. A `responseType: "stream"` result stays
cancellable: aborting `signal`, or the call `timeout`, errors the stream even after the Promise
resolved; cancelling the stream ends the request. Retry rules are unchanged: a `ReadableStream`
request body is never retried. Mocked calls report the real size of binary/text results and
`unsupported` for JSON and request bodies.

## File validation (opt-in)

Rules are declared next to `fileFields`; nothing is checked unless you configure it:

```ts
resources: {
  pets: {
    path: "/pets",
    fileFields: {
      photo: { maxSize: 5 * 1024 * 1024, accept: ["image/*", ".heic"], noExtension: "reject" },
      docs: { max: 3, minSize: 1, reject: [".exe", ".bat"], filename: "strict" },
    },
    fileLimits: { maxTotalSize: 20 * 1024 * 1024, maxFiles: 4 }, // operations override key-wise
    operations: {
      export: { kind: "read", method: "GET", path: "/export", responseType: "blob", maxResponseSize: 50 * 1024 * 1024 },
    },
  },
}
```

An invalid file rejects **before any request** (and before a mocked write) with the existing
`ValidationError`: `error.violations` lists `{ code, path, limit?, actual?, rule? }` (`FILE_TOO_LARGE`,
`TOO_MANY_FILES`, `TYPE_NOT_ALLOWED`, `EXTENSION_NOT_ALLOWED`, `UNSAFE_FILENAME`, `RESPONSE_TOO_LARGE`, …), never
contents or file names. Precedence: operation `fileFields[field]` / `fileLimits` override the resource's key by key (a
defined value, including `0`, wins). `accept`/`reject` take MIME types, wildcards and `.ext` entries (case-insensitive);
an allow-list rejects a file with no declared type unless `unknownType: "allow"`. `min` applies only when the field is
present. A raw `Blob` / buffer / string / `ReadableStream` body is bounded by `maxBodySize` / `maxTotalSize`; a stream is
counted as it flows (never buffered or read to validate), and a cut-off stream errors with `ValidationError`.
`maxResponseSize` (per operation or call) rejects early from a trustworthy `Content-Length` and otherwise counts bytes
while reading (blob, arrayBuffer, text, json and stream), without breaking cancellation, timeouts or backpressure;
`responseAccept` checks the declared `Content-Type`. A failed response keeps its status and `HttpError`; an oversized error body is dropped (`data` is `null`) rather than buffered. A `ValidationError` is never retried.

**This is not security.** Client-side rules give fast local feedback and save wasted uploads. `File.type` and `File.name`
are chosen by whoever built the `File`, an extension does not prove content, nothing is sniffed, and a limit hit mid-stream
cannot undo bytes already sent. Your backend must validate everything again.

**Redirects (v1.8.0):** a redirect is followed only within the request's own origin. A cross-origin redirect fails with
`SecurityError` before the destination is contacted, so credentials and custom headers are never forwarded. For a CDN, list
the destination with `redirectOrigins: ["https://cdn.example.com"]` (operation setting or call option): it is followed with
no headers, cookies or body (`GET`/`HEAD` only). Browsers hide redirect destinations, so any redirect fails closed there;
return the URL in a JSON body and use a `presigned` descriptor instead.

> **Production guidance:** guarantees, backend responsibilities, limits, measured memory and recovery for everything above are consolidated in [Production file handling](../../docs/guides/humans/production-file-handling.md).

## Errors

`ApiErrorCode`: `NETWORK` | `HTTP` | `PARSE` | `RESPONSE_SHAPE` | `VALIDATION` | `TIMEOUT` | `ABORT` | `CONFIG` | `HEADERS` | `SECURITY` | `TRANSFORM` | `SERIALIZATION` | `MOCK_NOT_FOUND` | `MOCK_DUPLICATE_ID` | `MOCK_INVALID_INPUT` | `MOCK_UNSUPPORTED` | `MOCK_LOAD`.  
`ApiError` has `code`, `retryable`, `attempt`. Specialized classes include `HttpError`, `ParseError`, `ResponseShapeError`, `ValidationError`, `TimeoutError`, `AbortError`, `ConfigError`, `SecurityError`, `TransformError`, `SerializationError`, `MockError`. Guards: `isApiError`, `isHttpError`, `isTimeoutError`.

## Notes

- Operations return native `Promise<T>` (unwrap) unless `full: true`.
- No React / Next / TanStack Query in Core.

## Advanced mock file storage

Existing mocked uploads need no configuration. Optional organization and fixtures extend the same
per-client virtual store:

```ts
import { defineApi, mockFiles, resetMock, mockFileFixture, mockFixtureRef } from "apixa/core";

const api = defineApi({
  baseURL: "https://example.test",
  resources: {
    docs: {
      path: "/docs",
      fileFields: ["file"],
      mock: {
        data: [{ id: 1, file: mockFixtureRef("readme") }],
        fixtures: { readme: mockFileFixture("hello", { name: "readme.txt", type: "text/plain" }) },
        storage: { disk: "documents", directory: "guides", naming: "unique" },
      },
    },
  },
});
const seeded = await api.docs.getById(1); // seeded.file: string
mockFiles(api).get(seeded.file)?.text(); // "hello"
await api.docs.patch(1, {
  body: { file: new File(["updated"], "guide.txt", { type: "text/plain" }) },
});
mockFiles(api).list({ disk: "documents", path: "guides" });
resetMock(api); // invalidates pending work immediately; fixtures rehydrate on next awaited read
```

A fixture accepts text, Uint8Array or Blob and an explicit name, optional MIME type and lastModified
(default 0). A registry value may be an async factory returning a descriptor. Only fixtures referenced
by selected seed records load, one at a time; multiple occurrences share one stored fixture within
that resource. An explicit `{ $apixaFixture: "key" }` marker can also be stored in JSON. Ordinary
strings never become fixture tokens. An unresolved marker fails initialization atomically. With a
registry configured, missing UUID refs also fail; without it, legacy seed strings stay unchanged.
Dataset providers and named datasets use this same machinery; bytes never enter dataset records.

`storage` also accepts `naming: "original"` (default) or a callback receiving
`{ id, name, type, resource, field }` and returning one safe filename segment. `generateId` must return
a unique UUID, allowing deterministic tests. Naming changes the stored name/ref suffix, not UUID
identity. Metadata retains `originalName` when renamed. Without a directory, paths use an ID directory
so identical original names coexist. With an explicit directory, same-disk/path collisions reject
without overwrite. Disks default to `default`; paths are relative, case-sensitive, use `/` and reject
traversal, absolute/drive/UNC paths, encoded traversal/separators, controls and schemes. A disk is a
logical grouping within the client's store. `mockFiles(resource)` continues to inspect that whole
client store. Filters match path segments (`a` includes `a/b`, not `ab`), in insertion order, without
reading bytes. A lookup still uses a UUID ref or bare ID, never a virtual path.

Managed replacement/deletion releases refs; it deletes bytes only after the last record/resource
owner and fixture pin is gone. Fixture pins retain the seed for reset. Public low-level `put` is
manually owned until delete/clear/resource reset. Explicit `delete`/`clear` may leave stale record
refs: low-level get/meta return undefined and handler get/meta throws `MOCK_NOT_FOUND`. Reset repairs
fixture baselines lazily, so synchronous storage reads can be empty until the next resource call.
UUID generators are not rewound on reset; a rehydrated fixture may have a new ref. Reads return
defensive byte copies; listing and ordinary record reads never duplicate stored binary data.

Managed calls commit records/files/ownership together after configured mock response checks.
Custom handlers see their draft writes and receive their original raw body. Throw, abort, timeout or
reset before commit discards managed changes; late calls to a finished handler handle reject.
External side effects and response middleware after commit cannot be rolled back. Mock operations
never use the network; fixture setup has no transfer events. Upload observation remains unsupported
and sized mock downloads report actual bytes. No File constructor is required for fixture setup;
Blob plus explicit metadata works in Node, browsers, SSR and Edge. No driver/provider dependency.

<a id="advanced-transfers-v170"></a>

## Advanced transfers (v1.7.0+)

Normal uploads and downloads keep their existing behavior. To use a backend's chunk/session
protocol, add `transfer` to a **write operation** (including a builtin override). Configuration is
operation-local; there is no automatic file-size threshold or resource-wide mode. Select a declared
file field with `source: "document"`, or select a raw Blob with `source: body => body` after checking
its type. Outer `dataFormat` and `transfer` cannot be combined; each protocol request selects its
own serialization. Operations still return native promises and their inferred domain result;
`full: true` returns the real finalization response metadata.

The maintained [Next recipe](../../examples/frontends/query-ssr-next/lib/advanced-transfer.ts) shows the
complete protocol: `initiate`, `inspect`, `uploadPart`, `complete`, and optional `abort`/`renew`.
Callbacks use a narrow `TransferStepContext.request({ kind, method, ... })`, which runs through
Core's existing request pipeline, transport, middleware, limits, timeout and retry mechanism.
Backend steps inherit caller headers, metadata and response limits; caller `retry: false` disables
step retries. Operation idempotency keys are scoped to initiation, individual parts and completion.
Control responses default to a 4 MiB cap through the existing `maxResponseSize` option. Presigned
steps receive no inherited headers or metadata and retain their isolated security policy.
Only that protocol context allows explicitly classified read and write steps in one upload.
Ordinary function `ctx.request` retains its kind restriction; write functions can compose a transfer
with `ctx.transfer(config, body, options)`.

Defaults are 8 MiB slices, one active part, and a maximum of 10,000 parts (provider limits may be
stricter). Parallelism is explicit and requires `independentParts`; otherwise it falls back to one.
Parts are sliced lazily. Hashing uses one bounded slice buffer; no whole-file ArrayBuffer is created.
Acknowledgment metadata grows with the capped part count. Validation checks the original logical
body after request middleware and before session creation; splitting cannot evade whole-file rules.
Non-seekable streams do not support this mode. A protocol must declare empty-file behavior.

`onTransfer` retains its existing per-request/per-attempt observed-byte semantics. Optional
`transfer.onSession` supplies immutable phase/part snapshots and unique server-confirmed bytes.
Reading an upload body is not a server acknowledgment. Unsupported byte observation stays absent;
observer errors are ignored. `uploadPart` must return a decoded server acknowledgment with exact
index/offset/size, optional ETag/checksum, and explicit verification strength. Completion must return
a real successful `ApiResponse` after parsing backend errors, including errors embedded under HTTP 200.

```ts
import { createTransferControl } from "apixa/core";

const control = createTransferControl();
const pending = api.files.create(
  { document: file },
  {
    transfer: {
      control,
      onSession: ({ confirmedBytes, total }) => updateProgress(confirmedBytes, total),
      saveCheckpoint: async (checkpoint) => saveToApplicationStorage(checkpoint),
    },
  },
);
await control.pause(); // quiesces parts and persistence; the deadline continues
control.resume();
await pending; // the original native Promise resolves after backend completion
```

The snippet assumes `api.files.create` is configured with the protocol shown in the linked recipe;
application progress and storage functions are supplied by the caller. A control binds to one active
invocation. `cancel()`/caller AbortSignal stop local work and reject AbortError without deleting remote
storage. `abort()` is a separate, awaited remote operation; deletion is confirmed only after the
backend acknowledges it. A failed abort does not pretend the session was deleted. Resume after
interruption is a **new call**, with a new signal/control, the reacquired Blob/File and the persisted
checkpoint in `transfer.checkpoint`.

Checkpoints are versioned typed metadata, never source bytes, headers, tokens or signed URLs.
`inspect` is required for durable resume and checkpoint persistence. Core validates operation,
protocol, layout, source type/size and a SHA-256 chunk-manifest identity before reconciliation.
The manifest is a content identity, **not** whole-file SHA-256. It detects same-size content changes;
name/time alone are insufficient. Core then inspects authoritative server state before skipping any
part. Expired, conflicting or unknown sessions fail without automatically creating another upload.
Keep opaque session IDs in access-controlled application storage. Persistence snapshots are deeply
immutable, ordered and awaited; save failure stops further scheduling. Cross-tab/process coordination
and durable storage are the application's responsibility.

Optional `integrity: "sha256"` sends bounded chunk digests to the protocol decoder. Resumable source
identity requires Web Crypto even with wire integrity `"none"`; unavailable required crypto rejects
before initiate. Local digests and server verification are separate evidence. ETags are opaque,
not MD5. Whole-file verification is a backend/protocol responsibility; no mandatory hashing SDK is
installed. Existing retry policy applies to safe replayable parts only; write retries are never
implicitly enabled. Use `replaySafeParts` only for a backend with safe part replacement/idempotency.
Control writes default to no retry; explicitly configured control-request retries require backend
idempotency. TanStack mutation retry must not blindly restart an upload: reuse its safe session and
checkpoint. Overall timeout covers all steps, hashing, pause, persistence and retry backoff.

### Presigned destinations

Opt in per operation with `presigned: { origins: ["https://storage.example.com"], headers: [...] }`.
Use `presigned: { url, headers? }` in a protocol request, ordinary `ctx.request`, or the call options
of an explicitly authorized download operation. Only exact HTTPS origins are accepted. Signed URLs
retain exact query encoding; ordinary path/query/header options cannot be combined with them.
Normal cross-origin calls still fail the original same-origin guard.

Delegated requests begin with empty credentials/headers. Inherited header providers and ordinary
request middleware do not run for them. Only explicitly trusted `presigned.requestMiddleware` runs,
then destination, method, body identity and allowed headers are checked again. Authorization/Cookie/
Proxy-Authorization/Host cannot be passed. Fetch uses `credentials: "omit"` and `redirect: "error"`.
A custom Transport must advertise `capabilities: { presigned: true }` **and enforce** the supplied
security policy; otherwise Core rejects it before sending. Response/error request metadata and
library error causes are sanitized; auth-refresh replay is disabled for signed errors. Trusted request
middleware intentionally sees the URL and must not log its secrets. Credential/signing keys stay on
the server. Backend renewals are explicit, bounded and reconciled before repeating uncertain parts.

Presigned reads through React queries require explicit nonsecret `keyParts`. Do not put signed URLs
in query keys or SSR props. Buffered Blob/ArrayBuffer downloads retain their documented memory cost;
use the existing stream response with a caller-owned sink for bounded large downloads. Range resume
is not implemented in this milestone.

The [SDK-free S3 recipe](../../examples/frontends/query-ssr-next/lib/s3-transfer.ts) delegates initiate,
presign, list, complete and abort to the backend. It sends raw part blobs, captures exposed ETags,
and completes an ordered part manifest. Configure storage CORS to expose ETag; the backend must
paginate ListParts and normalize provider errors/checksum evidence. HTTP multipart/form-data and
S3 multipart sessions are different protocols. No general storage adapter, credentials manager or
cloud SDK is added. Production mock resources explicitly reject advanced session orchestration with
MOCK_UNSUPPORTED; deterministic protocol tests use an injected transport and the existing mock file
store remains unchanged.

Advanced finalization honors buffered `responseType` overrides (text, Blob, ArrayBuffer). For an
already-completed resume, the protocol inspector must provide a matching response representation;
Core rejects a mismatch. A live stream cannot be the completion result of an upload session: use
an existing separate download operation for streaming. Function `ctx.transfer(..., { full: true })`
also preserves the typed final response envelope. Raw chunk blobs cannot be replaced by request
middleware after hashing; transform the logical source before validation instead.
