# Production file handling

A task-oriented guide for **using** Apixa's file features in a production application. It states
what Apixa guarantees, what your backend must do, and what to do when things go wrong. Reference
detail lives in [`packages/core/README.md`](../../../packages/core/README.md) and
[`packages/react/README.md`](../../../packages/react/README.md); this page links to them instead of
repeating them. Status: **implemented** (v1.1.0–v1.8.0 behavior; v1.8.0 hardening evidence is in
[`versions/v1.8.0/acceptance-criteria.md`](../../../versions/v1.8.0/acceptance-criteria.md)).

> Common workflows work without configuration; unusual backend requirements stay configurable.

## Who owns what

| Apixa owns (and guarantees)                                                              | Your backend / storage provider owns                                                      | You own (application policy)                                             |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Building requests, rule checks **before** sending, bounded reads, typed errors           | Authentication, authorization, real content validation, virus scanning, quotas            | Whether a file is deleted or replaced when a record changes              |
| Client-side **mock** file storage (in memory, per client) and its atomic managed commits | Remote file storage, durable sessions, expiry, assembly of parts, deletion                | Where and when a checkpoint is persisted; retry and UX policy            |
| Apixa's **own transfer sessions**: part scheduling, retries, reconciliation, abort       | Idempotency and part semantics the protocol claims, final integrity of the assembled file | Reacquiring the same `File` after a restart; presigned origin allow-list |
| Cancelling streams it created (timeout, abort) — streams handed to you are yours         | —                                                                                         | Cancelling or draining every stream you receive                          |

Apixa **never deletes a remote file** because a frontend record changed, and never promises
atomicity across a backend, a storage provider and your database. A record update and a file
upload are separate systems: if you need "replace the file, then update the record, then delete the
old file", sequence those steps yourself and make each step idempotent.

## 1. Normal upload and download

```ts
const api = defineApi<{ users: { path: "/users"; entity: User } }>()({
  baseURL: "https://api.example.com",
  resources: { users: { path: "/users", fileFields: ["avatar"] } },
});
await api.users.create({ name: "Ada", avatar: file }); // multipart/form-data, automatically
const blob = await api.users.getById("1", { responseType: "blob" });
```

No configuration is needed beyond `fileFields`. See
[File uploads](../../../packages/core/README.md#file-uploads) and
[File downloads](../../../packages/core/README.md#file-downloads-and-binary-responses).

## 2. Validation and safety limits

Rules are **opt-in** (`maxSize`, `accept`, `reject`, `max`, `fileLimits`, `maxResponseSize`) and run
before any request is sent, with identical results for live and mocked resources. A violation is a
`ValidationError` whose `violations` are typed and never contain file contents or names.

- **This is not security.** `File.type` and `File.name` are chosen by the caller; extensions do not
  prove content. Your backend must validate again.
- **Responses are unbounded by default.** `maxResponseSize` is opt-in. Set it on every operation that
  reads a body into memory (`blob`, `arrayBuffer`, `text`, `json`), or use `responseType: "stream"`
  for large downloads.
- **Custom transports:** the built-in fetch transport counts bytes while reading. A custom
  `Transport` receives the limit in `request.limits`; Apixa re-checks the finished body, but a
  transport that buffers a huge body first has already used the memory. Bounding the read is the
  transport's job.
- **Non-2xx bodies** keep their `HttpError`; an oversized error body is dropped (`data` is `null`).
- **Redirects are inspected before they are followed (v1.8.0, secure by default).** A plain `fetch`
  forwards custom headers (`X-Api-Key`, …) to a cross-origin redirect target and strips only
  `Authorization`, so Apixa follows redirects itself, one hop at a time:
  - **Same origin:** followed with the request unchanged (method and body rewritten like `fetch`
    does; a streamed body cannot be replayed for a 307/308 and fails closed).
  - **Another origin:** refused with `SecurityError` **before** the destination is contacted. The
    message names origins only, never the `Location` path or query.
  - **CDN workflows:** list the destination in `redirectOrigins: ["https://cdn.example.com"]`
    (operation setting or per-call option; exact `http(s)` origins, no wildcards). A listed origin
    is followed **with no headers, cookies, credentials or body**, only for `GET`/`HEAD` (a `303`
    turns a `POST` into a bare `GET`; a `307`/`308` `POST` is refused). A listed origin cannot
    redirect on to an unlisted one. A signed CDN URL needs no credentials, so nothing is lost.
  - **Browsers cannot be inspected:** `fetch(..., { redirect: "manual" })` returns an _opaque_
    redirect with no destination, so Apixa fails closed for **any** redirect in a browser (including
    same-origin ones such as trailing-slash redirects and including listed origins). Call the final
    URL, or have your API return the URL in a JSON body and fetch it with a `presigned`
    descriptor (the supported browser CDN pattern).
  - Node, Vercel Edge Runtime and workerd expose the redirect's `Location`, so the full policy
    applies there. Custom transports own their redirect policy.
  - **Compatibility:** an API that redirected to another origin used to work and now fails with
    `SecurityError`; add `redirectOrigins` (server-side runtimes) or return the URL in the body.
    Presigned steps are unchanged: `redirect: "error"`, no credentials.

## 3. Streaming and transfer progress

`onTransfer` reports observed bytes per attempt; it never claims server acknowledgment. Runtimes
differ (Chromium cannot observe upload progress without changing the wire, so Apixa reports
`unsupported` rather than faking it). See
[Transfer progress, streaming and cancellation](../../../packages/core/README.md#transfer-progress-streaming-and-cancellation).

- **Stream ownership.** A `responseType: "stream"` result is yours: read it to the end, or
  `cancel()` it. The call `timeout` and `signal` still end it after the Promise resolved.
- **Never put streams in the TanStack cache.** A cached stream is replaced on refetch **without being
  cancelled** (cancelling a stream someone may still hold would make it read as an empty, successful
  download). For downloads that must stream, call the client directly
  (`await api.files.download(id)`) as the tracked example does, and let `useResource` cache only
  metadata. `dehydrate` omits `Blob`, `ArrayBuffer` and stream query data, so they never cross the
  Next.js server/client boundary.
- **Flat reads are cached.** A second `useResource` read inside `staleTime` returns the cached
  `Blob` and sends no request. Set `staleTime: 0` or use the client directly for one-shot downloads.
- **Memory with progress.** A raw `Blob` body with `onTransfer` is streamed (bounded). A `FormData`
  body is serialized by the runtime: Node's fetch buffers the whole multipart body **with or without
  progress** (about 2× the file in resident memory in measurements). For files over a few tens of
  MiB, send the raw `Blob` as the body or use an advanced chunked transfer.

## 4. Mock file storage

Mocked resources keep uploaded bytes in a virtual, per-client store (`mockFiles(api)`), with disks,
paths and reference-aware cleanup. Guarantees and differences from a live backend:

| Behavior                      | Mock                                                                              | Live backend                          |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| Managed write (record + file) | Atomic per client: a failure leaves records and files unchanged                   | Not provided; depends on the backend  |
| Replacing a file              | Old file is removed when no record owns it any more                               | Backend decides (Apixa never deletes) |
| Shared files                  | Kept while any record owns or pins them                                           | Backend decides                       |
| `mockFiles(api).delete/clear` | Deliberate and unconditional: **records may keep a stale ref**                    | n/a                                   |
| Concurrent storage change     | A managed write fails (`MOCK_INVALID_INPUT`) rather than committing partial state | n/a                                   |
| Advanced (chunked) transfers  | `MOCK_UNSUPPORTED` — never fabricated; supply handlers to simulate                | Real protocol                         |
| Paths and names               | Virtual; separators, `..` and control characters never become path segments       | Backend-defined                       |
| Memory                        | Bytes are copied in and out (about 2–3× a file's size transiently)                | n/a                                   |

Scaling: `put` costs time proportional to the number of stored files (measured ≈ 0.01–0.03 ms per
`put` at 1,000–4,000 files). Mock storage is for tests and demos, not large fixture sets.

## 5. Advanced (chunked, resumable) transfers

Add `transfer` to a write operation to use a backend's session protocol. Resumability **requires
backend support**: the protocol must be able to report which parts it has (`inspect`). Apixa does
not invent endpoints.

Guarantees (tested with deterministic fault injection at every protocol step):

- A part is delivered **at least once**; completion is applied **exactly once**. After any
  interruption the **server's** state, not the client's memory, decides what is skipped.
- A lost completion reply is reconciled through `inspect`; it never completes twice.
- `abort()` never races a completion: while a completion is in flight, `abort()` waits for it and
  rejects with a `ConfigError` ("the upload already finished") instead of aborting a finished
  session (fixed in v1.8.0).
- With parallel parts, an acknowledgment that arrives during a `renew`/`inspect` is not lost (fixed
  in v1.8.0).
- A failed remote `abort` keeps the checkpoint on the error so you can retry it.
- Memory is bounded by `concurrency × chunkSize` plus one hash chunk, **not** by file size
  (measured ≈ 64–80 MiB external buffers for 64, 256 and 512 MiB files at 8 MiB parts, concurrency 2).
- Cost per acknowledgment is constant in part count (v1.8.0; it was quadratic).

You are responsible for:

- **Persisting checkpoints** (`saveCheckpoint`) and giving them back (`checkpoint`) with the **same
  file**; a changed file is rejected by its chunk manifest.
- **Treating a checkpoint as untrusted input.** Its `session.id` is passed to your protocol steps
  verbatim and is **not** pattern-checked (providers' ids differ, so there is no one safe pattern).
  Always `encodeURIComponent(session.id)` when building a URL, and let your backend validate and
  authorize every session id it receives. Apixa limits the id to 2,048 characters and validates the
  rest of the structure, but cannot know your URL shape.
- **Cleaning up abandoned sessions** (cancelled, crashed, never resumed). Apixa cannot reach a
  session it no longer holds a checkpoint for, so set an expiry on the backend side. If the very
  first checkpoint save fails, the error still carries the in-memory checkpoint.
- **Choosing concurrency.** Apixa never caps it (author-defined; invalid values — zero, negative,
  fractional, `NaN`, `Infinity` — are rejected before any request, and in-flight requests never
  exceed the value you set). A value like 10,000 would open that many requests: keep it small
  (typically 2–8) and respect your provider's limits.
- **Server-side idempotency.** Apixa sends a stable `Idempotency-Key` per part for replay-safe
  protocols; honoring it is the backend's job.

Recipe and protocol shape: [Advanced transfers](../../../packages/core/README.md#advanced-transfers-v170).

## 6. Presigned URLs and S3-compatible uploads

Backend-issued, temporary destinations only; signing and secrets stay on your server.

- The destination origin must be allow-listed explicitly; requests to it carry **no** ambient
  credentials, ignore inherited headers/metadata, never follow redirects, and appear as
  `[presigned destination]` in errors and logs (the signed query string is never exposed).
- An S3-compatible multipart upload is a **multi-request session protocol** (initiate, presigned
  part URLs, ETags, complete), not HTTP `multipart/form-data`. The tracked
  [S3 recipe](../../../examples/frontends/query-ssr-next/lib/advanced-transfer.ts) needs no AWS SDK. CORS must
  expose `ETag`; expired URLs are renewed through the protocol's `renew` step.

## 7. Resource ownership and cleanup (checklist)

- Cancel or drain every `ReadableStream` you receive.
- Create a `TransferControl` per transfer; call `cancel()` on unmount/route change.
- Keep the abort signal you pass; Apixa removes its listeners when the call settles.
- Delete remote files in **your** backend, in your own transaction, never as a side effect of a
  frontend update.
- Expire server-side sessions; do not rely on the client to clean up after a crash.

## 8. Runtime support

Node 22 and 24, React 18 and 19 (optional peers), TanStack Query v5, Next.js server rendering and
hydration, Chromium, Vercel Edge Runtime and Cloudflare workerd are exercised by `pnpm verify` on
packed consumers. Platform differences that remain: jsdom's `Blob` has no `arrayBuffer()` or
`stream()`; Chromium and workerd report upload progress as `unsupported`; hashing needs Web Crypto.

## 9. Performance considerations

| Path                                | Measured behavior (Node 24, one developer machine; numbers are indicative)           |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Advanced upload memory              | Flat at ≈ 64–80 MiB external buffers from 64 MiB to 512 MiB files (8 MiB parts, ×2)  |
| Checkpointing                       | ≈ 0.03 ms per part from 500 to 8,000 parts (was 0.47 → 2.7 ms and rising)            |
| Raw `Blob` upload with `onTransfer` | ≈ 2 MiB resident growth for a 128 MiB file                                           |
| Multipart `FormData` upload (Node)  | ≈ 250 MiB resident growth for a 128 MiB file, with or without progress               |
| Re-hashing on resume                | One pass over the whole file before any request (bounded memory; cost is read speed) |

Reproduce with `pnpm build && node --expose-gc scripts/measure-file-memory.mjs`.

## 10. Common mistakes and recovery

| Mistake                                                        | What happens                                                  | Do instead                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| Relying on client rules as security                            | A crafted request skips them                                  | Validate on the backend                                  |
| No `maxResponseSize` on a buffered download                    | The whole body is held in memory                              | Set it, or stream                                        |
| Streaming through `useResource` and refetching                 | Old stream stays open until its owner ends it or it times out | Call the client directly for streams                     |
| A redirect to a CDN while relying on custom-header credentials | `SecurityError`: nothing is forwarded cross-origin            | `redirectOrigins`, or return the URL and use `presigned` |
| Interpolating `session.id` into a URL unencoded                | A tampered checkpoint can change the path                     | `encodeURIComponent`; validate ids on the backend        |
| Keeping uploaded `File`s in the mutation cache                 | TanStack holds mutation variables for `gcTime` (5 min)        | `mutations.gcTime: 0` on the `QueryClient`, or `reset()` |
| Resuming with a different file                                 | Rejected (manifest mismatch)                                  | Reacquire the same file                                  |
| Very large `FormData` with progress in Node                    | Whole body buffered                                           | Raw `Blob` body or chunked transfer                      |
| Expecting mocked chunked transfers to "work"                   | `MOCK_UNSUPPORTED`                                            | Provide mock handlers                                    |

**Failure recovery:** a failed advanced transfer carries `error.advancedTransfer = { reason, phase,
checkpoint? }`. `reason` is one of `checkpoint`, `durability`, `session-expired`, `integrity`,
`protocol`, `interrupted`. Resume from the checkpoint for `interrupted`/`durability`; start a new
session for `session-expired`; treat `integrity`/`protocol` as a backend or source problem.

## Not covered (deferred)

Range or resumable **downloads**, a global stream manager, provider SDK adapters, automatic remote
cleanup or TTL, browser persistence for checkpoints, cross-tab locking, and distributed
transactions. See [`versions/v1.8.0/scope.md`](../../../versions/v1.8.0/scope.md).
