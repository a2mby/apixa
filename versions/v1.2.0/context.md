# v1.2.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

File Downloads & Binary Responses (Advanced File Handling, phase 3): an operation can return
`Blob`, `ArrayBuffer`, text or a stream, **typed from its configuration**, with download metadata
available through the existing `{ full: true }` response, and mocked resources can serve the bytes
that were uploaded to the v1.1.0 virtual file store. No download client, no new operation system.

> Common workflows work without configuration; unusual backend requirements stay configurable.

```ts
type Report = { id: string; name: string; file: string }; // `file` is a v1.1.0 reference

const api = defineApi<{ reports: { path: "/reports"; entity: Report } }>()({
  baseURL: "https://api.example.com",
  resources: {
    reports: {
      path: "/reports",
      fileFields: ["file"],
      operations: {
        download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
      },
    },
  },
});

const blob = await api.reports.download("1"); // Blob: parsed, typed, not key-transformed
const res = await api.reports.download("1", { full: true }); // ApiResponse<Blob>
parseContentDisposition(res.headers).filename; // string | undefined
await api.reports.getById("1", { responseType: "arrayBuffer" }); // ArrayBuffer (per call)
```

## The problem

The audit of the v1.1.0 tree found that the transport can already read a body as `blob`,
`arrayBuffer`, `text` or `stream` (`responseType`), but the feature is incomplete as a product:

1. `responseType` exists **only per call** (`RequestOptions`, `ctx.request` init). A declarative
   operation cannot declare it, so every caller must repeat it.
2. **Types ignore it.** `CallResult` looks only at `full`; `getById(id, { responseType: "blob" })`
   is typed as the entity, `ctx.request<T>()` makes the caller assert `T`, and a runtime
   `responseType: "blob"` on an operation does not infer `Blob`.
3. A non-2xx response is read with the **same** `responseType`: a JSON error body of a blob
   download arrives in `HttpError.data` as a `Blob`.
4. A 204/205 returns `null` whatever the type says.
5. Unknown `responseType` values are silently treated as JSON; nothing validates them.
6. Builtin shaping (`getAll` → `toArray` / `slice`) assumes JSON data and would mangle a `Blob`.
7. Mocked resources ignore `responseType`, return empty headers, and a mock handler cannot read
   the file store; `mockFiles(api)` is reachable only outside the pipeline.
8. There is no way to read a filename from `Content-Disposition`.
9. There are **no tests** for any of the existing `responseType` behavior.

## Current capabilities (verified, not rebuilt)

| Capability                                                                                | Where                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ResponseType = "json" \| "text" \| "blob" \| "arrayBuffer" \| "stream"`                  | `types/transport.ts`                                   |
| Body reading per type; JSON default with content-type fallback                            | `transport/read-body.ts`, used by `transport/fetch.ts` |
| Per-call `responseType` through `sendWithRetry`; `ctx.request` forwards it                | `request/pipeline.ts`, `api/resource-client.ts`        |
| `ApiResponse<T>` (`data`, `status`, `headers`, `request`, `raw`) via `full`               | `types/transport.ts`, `request/pipeline.ts`            |
| Key transforms leave `Blob` / streams / non-plain values untouched                        | `transform/keys.ts` (`isPlainObject` walk)             |
| Virtual file store, `mockFiles(api)`, `isMockFileRef`, `MockStoredFile`                   | `mock/files.ts`, `api/reset.ts` (v1.1.0)               |
| Mock custom operations through `mock` handlers; mock results pass `data` on               | `mock/handler.ts`, `request/pipeline.ts`               |
| Error hierarchy (`HttpError`, `ParseError`, `AbortError`, `TimeoutError`, `MockError`, …) | `errors/`                                              |

## Principles that bind this release

1. Downloads are **ordinary operations**: same resource, same middleware, same transport, same
   `full` envelope. No `defineDownloadApi`, no download client, no parallel operation system.
2. **Configuration infers types.** A literal `responseType` selects the result type; an explicit
   `response` in the `defineApi<T>()` metadata still wins; existing generic contracts are unchanged.
3. Defaults do not move: no `responseType` means today's JSON behavior, byte for byte.
4. Binary data is never JSON-parsed, key-transformed, stringified or shaped as JSON.
5. Metadata is the existing `ApiResponse` plus **one pure parsing helper** for
   `Content-Disposition`; content type and length are `headers.get(...)`. Never assume a filename
   or a length exists.
6. Mocked and live resources return the same types. The mock serves bytes from the **existing**
   virtual store; there is no second mock file system.
7. Core stays framework- and browser-independent: standard `Response`, `Blob`, `ArrayBuffer`,
   `Headers`, `TextDecoder` only. No `node:*`, no DOM-only APIs, no `Buffer`.
8. One published package `apixa`; no new workspace packages or dependencies.

## Definition of success

- A binary-returning operation is declared once and returns correctly typed data, in direct calls,
  `useResourceQuery`, `useResource`, custom operations and published npm declarations.
- Download metadata (`status`, `headers`, content type, length, filename) is reachable from
  `{ full: true }` without new wrappers.
- A failed download surfaces as `HttpError` with a readable JSON/text body; aborts, timeouts and
  retries behave exactly as for JSON operations.
- A mocked download returns the bytes and metadata of a previously uploaded file; reset and delete
  make it fail with `MOCK_NOT_FOUND`.
- Packed npm consumers, Chromium, Node, Next SSR, Vercel Edge and workerd verify it; `pnpm verify`
  passes.

## Intentionally out

Progress tracking, resumable or ranged downloads, chunked or parallel transfers, streaming progress
APIs, presigned URL workflows, S3 or cloud adapters, advanced mock disks and fixtures, React Hook
Form adapters, automatic browser download triggers or UI, and unrelated resource or transport
redesigns. They belong to later milestones (see `docs/roadmap.md`).
