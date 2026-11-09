# v1.3.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

File Transfer Progress, Streaming & Reliability (Advanced File Handling, phase 4): an **opt-in**,
typed way to observe upload and download progress and transfer lifecycle, to stream bodies where the
runtime allows, and to cancel, time out and retry transfers correctly. It extends the existing
`RequestOptions`, `Transport` and request pipeline. Uploads and downloads without any of it behave
exactly as in v1.1.0 / v1.2.0.

> Common workflows work without configuration; unusual backend requirements stay configurable.

```ts
// Illustrative shape; exact names are locked in Batch 0 (see implementation-plan.md).
const blob = await api.reports.download("1", {
  onTransfer(e) {
    // e.direction: "download", e.phase: "start" | "progress" | "complete" | "error" | "abort"
    // e.loaded: number, e.total: number | undefined (never invented), e.attempt: number
  },
});

const stream = await api.reports.export({ responseType: "stream", signal }); // ReadableStream | null
// aborting `signal` later cancels the in-flight stream; a stalled stream hits the call timeout
```

## The problem (audit of the v1.2.0 tree)

1. **No seam for progress.** `Transport.request` returns a fully read body (`readBody` runs inside
   `transport/fetch.ts`). Nothing observes bytes while a `Blob` / `ArrayBuffer` / text body is
   consumed, and `TransportRequest` has no hook for sent bytes.
2. **A streamed response escapes cancellation and the timeout.** `runOperation` calls `cleanup()` in
   `finally`: it clears the timeout timer and removes the listener that forwards `options.signal`.
   For `responseType: "stream"` the promise resolves with `response.body` before it is consumed, so
   aborting the caller's signal or hitting the budget afterwards no longer reaches the stream.
3. **Stream request bodies are half-supported.** `serializeBody` passes a `ReadableStream` through and
   `isReplayable` already refuses to retry it, but the fetch transport never sets `duplex: "half"`,
   which Node (undici) and Chromium require for a stream body. No test sends one.
4. **Interrupted transfers are not classified.** A connection that drops mid-body inside
   `readBody` surfaces as a generic `NetworkError`; there is no byte count, no direction, no way to
   tell "failed after N of M bytes".
5. **Retries are invisible to observers.** `onRetry` exists, but nothing tells a UI that attempt 2
   restarted a transfer, so progress would jump backwards without explanation.
6. **Mocks have no transfer shape.** Mocked resources resolve in memory; `stream` is
   `MOCK_UNSUPPORTED` (v1.2.0). Callers who wire progress UI cannot test it against a mock.
7. **Upload progress through `fetch` is not available in general.** Browsers expose no upload
   progress for `fetch`; streaming request bodies work only in some runtimes and protocols. Any
   solution must say so rather than report a made-up percentage.

## Current capabilities (verified, not rebuilt)

| Capability                                                                                           | Where                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `File` / `Blob` / `FormData` / multipart request bodies, `SerializationError`                        | `http/body.ts`, `http/multipart.ts` (v1.1.0)            |
| `responseType` per call and per operation, inferred `Blob` / `ArrayBuffer` / `string` / stream types | `types/inference.ts`, `transport/read-body.ts` (v1.2.0) |
| One `AbortController` per logical call: caller signal + overall timeout covering retries and backoff | `request/pipeline.ts` `createCallSignal`                |
| Retry policy, `decideRetry`, `Retry-After`, idempotency keys, non-replayable body never retried      | `request/retry.ts`, `sendWithRetry`                     |
| Request / response / error middleware; binary-safe pipeline (no key transforms or shaping)           | `request/pipeline.ts` (v1.2.0)                          |
| `ApiResponse` with `{ full: true }`; `parseContentDisposition`                                       | v1.2.0                                                  |
| Virtual mock file store, mock downloads                                                              | `mock/files.ts` (v1.1.0 / v1.2.0)                       |
| Injectable `Transport`; fetch transport                                                              | `transport/fetch.ts`, `tests/helpers/fake-transport.ts` |
| Packed-npm type consumers, Chromium, Next SSR, Vercel Edge, workerd verification                     | `scripts/verify-*.mjs`                                  |

## Principles that bind this release

1. **Honesty over polish.** Never fabricate a percentage, a total, a completion or a server
   acknowledgment. `total` is `undefined` unless trustworthy. Upload bytes are described as what the
   runtime consumed, not what the server received, and a runtime that cannot observe uploads reports
   that fact instead of progress.
2. **One pipeline.** Progress, streaming and lifecycle events are produced inside the existing
   `runOperation` / `sendWithRetry` / `Transport` path. No second client, no parallel execution
   path, no new package.
3. **Opt-in.** No option set → no wrapping, no extra reads, no behavior or timing change, byte for
   byte. A body is only wrapped when an observer asked for it.
4. **One event mechanism**, discriminated by `direction` and `phase`, small enough to document in a
   table. Callback errors never break a transfer.
5. **Types follow configuration** (as in v1.2.0). Existing result inference is untouched; the event
   callback is typed on builtins, custom operations, `ctx.request()` and hooks.
6. **Reliability is the existing contract.** Retry policy, idempotency, replayability and the
   timeout budget keep their meaning; the work is closing the gaps listed above, not new policies.
7. **Core stays framework- and Node-independent.** Standard `fetch`, streams, `Blob`, `Headers`,
   `TransformStream`-class APIs behind feature detection. No `node:*`, no DOM-only APIs, no new
   dependency.

## Definition of success

- A caller can observe typed progress for downloads of every `responseType` and for uploads where
  the runtime allows, with `total` only when trustworthy, plus start / complete / error / abort and
  the retry attempt number.
- A `stream` response stays cancellable and time-limited after the operation promise resolves;
  backpressure and byte integrity are preserved.
- Interrupted transfers are classified (abort vs timeout vs network) consistently, and no
  non-replayable body is ever retried.
- Unsupported capabilities are detected and reported, never faked.
- Existing v1.1.0 / v1.2.0 behavior is unchanged; their tests pass without edits.
- Verified through React 18/19, packed npm consumers, Chromium, Node, Next SSR, Vercel Edge and
  workerd; `pnpm verify` passes.

## Intentionally out

Chunked, resumable or parallel transfers, transfer checkpoints, presigned URLs, storage adapters,
advanced mock storage, file validation policies, framework-specific form adapters (React Hook
Form), a new transfer client or package, automatic browser download triggers, and unrelated
transport or resource redesigns. See `docs/roadmap.md` for the later phases.
