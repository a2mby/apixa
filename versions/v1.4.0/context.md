# v1.4.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

File Validation, Middleware & Safety (Advanced File Handling, phase 5): **opt-in**, typed file rules
(size, count, MIME type, extension, filename) declared in the configuration Apixa already has
(`fileFields`, operations) and enforced inside the existing request pipeline — before a request is
sent where that is possible, and with bounded counting where it is not (streams, downloads). A
violation is a `ValidationError` with a stable code and safe details. With no rules configured,
behavior is byte-for-byte what v1.3.0 does.

> Common workflows work without configuration; unusual backend requirements stay configurable.

```ts
// Illustrative shape; exact names are locked in Batch 0 (see implementation-plan.md).
const api = defineApi<{ pets: { path: "/pets"; entity: Pet } }>()({
  baseURL: "https://api.example.com",
  resources: {
    pets: {
      path: "/pets",
      fileFields: {
        photo: { maxSize: 5 * 1024 * 1024, accept: ["image/*", ".heic"] },
        docs: { max: 3, maxSize: 10 * 1024 * 1024, accept: ["application/pdf"] },
      },
      operations: {
        export: {
          kind: "read",
          method: "GET",
          path: "/export",
          responseType: "blob",
          maxResponseSize: 50 * 1024 * 1024,
        },
      },
    },
  },
});

await api.pets.create({ name: "Mia", photo: tooBig }); // rejects with ValidationError before any request
// error.code === "VALIDATION"; error.violations[0] -> { code: "FILE_TOO_LARGE", path: "$.photo", limit: 5242880, actual: 9437184 }
```

## The problem (audit of the v1.3.0 tree)

1. **Nothing limits a file.** `fileFields` carries only names and a wire `name`; a 2 GB `File`, a
   `.exe` renamed `.png` or fifty files in a single-file field are serialized and sent.
2. **`ValidationError` exists but is unused for files.** It has code `VALIDATION` and a response-flavored
   default message; the only thrower is the missing-path-parameter check. There are no typed details.
3. **No pre-send checkpoint.** Order today is: headers → request middleware → key transform →
   `serializeBody` + transport inside `sendWithRetry`. A rule has nowhere obvious to live, and the
   mock branch skips serialization entirely, so mocked and live calls could not agree.
4. **Streams and unknown sizes.** A caller `ReadableStream` body has no size; v1.3.0's counting
   stream observes bytes but cannot refuse them. Download sizes come only from `Content-Length`, which
   a server controls and compression invalidates.
5. **Downloads are unbounded.** `readBody` buffers a blob/arrayBuffer/text fully; a stream result has
   no cap. A malicious or buggy endpoint can exhaust memory.
6. **Failures are indistinct.** A bad file surfaces (if at all) as a server `HttpError`, a
   `SerializationError` or a transport failure — none says _which_ rule or _which_ field.
7. **MIME and extension are client-supplied.** `File.type` and `File.name` are chosen by whoever built
   the `File`; treating them as proof of content would be a false sense of safety.

## Current capabilities (verified, not rebuilt)

| Capability                                                                                              | Where                                                    |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `fileFields` (names or `{ name }`), entity-checked; operation `dataFormat` / `multipart`                | `types/definition.ts`, `api/resource-client.ts` (v1.1.0) |
| Binary discovery in nested bodies (bounded depth), multipart encoding, `SerializationError` (path only) | `http/multipart.ts`, `http/body.ts` (v1.1.0)             |
| Virtual mock file store; mock create/update with files; read-only `files` handle                        | `mock/files.ts`, `mock/files-exec.ts` (v1.1.0–2)         |
| `responseType`, status-aware `readBody`, binary-safe pipeline                                           | `transport/read-body.ts`, pipeline (v1.2.0)              |
| `onTransfer`, `countedStream`, `bindStreamLifetime`, `detectTransferSupport`, per-attempt channel       | `transfer/`, `transport/fetch.ts` (v1.3.0)               |
| Request / response / error middleware, replay, retries that never replay a stream                       | `request/pipeline.ts`                                    |
| Error hierarchy incl. `ValidationError` (`VALIDATION`), `SerializationError`, `MockError`               | `errors/`                                                |
| Packed-npm type consumers, Chromium, Next SSR, Vercel Edge, workerd verification                        | `scripts/verify-*.mjs`                                   |

## Principles that bind this release

1. **Opt-in, zero cost by default.** No rule → no walk of the body, no wrapped stream, no extra header,
   no behavior or timing change. A rule is declared where files are already declared.
2. **One pipeline, no new hooks.** Validation is a step in `runOperation`, after request middleware
   and key transforms (so middleware-added files are checked) and before serialization, the transport
   and mock execution. Request / response / error middleware are unchanged and see
   `ValidationError` through the normal error path. No file-middleware API.
3. **Developer experience, not security.** Client-side rules give fast, local feedback and avoid wasted
   uploads. They are **not** authoritative: the backend must re-validate everything. `File.type` and
   `File.name` are caller-controlled, extensions do not prove content, and Apixa never claims a file is
   safe. No content sniffing in this release.
4. **Never consume an unbounded stream to validate it.** A stream body or response is only _counted_
   against a byte limit as it flows (pull-based, backpressure kept); nothing is buffered, and
   metadata that cannot be known is reported as unknown, never guessed.
5. **Safe errors.** A violation names a code, a path and numbers (limit / actual); never file
   contents, and by default not file names. `ValidationError` is reused; its class and `VALIDATION`
   code do not change.
6. **Mocked equals live.** The same rules run on the same bodies before mock execution; a rejected
   request leaves the virtual file store untouched.
7. **Honest about order and cost.** A pre-send violation starts no request and emits no transfer event.
   A limit hit mid-stream aborts the transfer, and bytes up to the limit may already have been sent;
   documented, never hidden.
8. **Core stays framework- and Node-independent; no new package, no schema dependency.**

## Definition of success

- A resource declares limits next to its `fileFields`; invalid files are rejected locally with a typed,
  safe `ValidationError` before any network request, in direct calls, custom operations,
  `ctx.request()`, mocked resources and React hooks.
- Streams and downloads are bounded without buffering and without breaking backpressure,
  cancellation, timeouts or retries.
- Unconfigured apps, and all v1.1.0–v1.3.0 tests, behave exactly as before.
- Docs state plainly what client-side validation can and cannot guarantee.
- Verified through React 18/19, packed npm consumers, Chromium, Node, Next SSR, Vercel Edge and
  workerd; `pnpm verify` passes.

## Intentionally out

Content sniffing / magic-byte detection, antivirus or malware scanning, image dimension or media
validation, advanced mock storage, resumable / chunked / parallel transfers, checkpoints, presigned
URLs, cloud adapters, React Hook Form and Zod integrations, schema libraries, a validation client or
package, rate limiting, and unrelated networking features. See `docs/roadmap.md`.
