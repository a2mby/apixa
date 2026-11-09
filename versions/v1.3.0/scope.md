# v1.3.0 — Scope

## In scope

| Area              | Item                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle events  | One opt-in callback on `RequestOptions` (and an operation default) receiving a discriminated `TransferEvent`: `start`, `progress`, `complete`, `error`, `abort`; `direction`, `loaded`, `total?`, `attempt`      |
| Download progress | `blob`, `arrayBuffer`, `text`, `json` and `stream` responses; `total` from `Content-Length` only when trustworthy (no `Content-Encoding`, finite, not contradicted); unknown length stays `undefined`            |
| Upload progress   | `File`, `Blob`, `FormData`, multipart, `ArrayBuffer`/typed arrays, strings, and `ReadableStream` bodies, only where the runtime can observe bytes; otherwise an honest `unsupported` signal, never fabricated    |
| Capability probe  | Feature detection (streaming request bodies, `duplex`, response body streams, `TransformStream`) exposed so callers can ask what will happen; documented per runtime                                             |
| Streaming         | `responseType: "stream"` stays a `ReadableStream`; request `ReadableStream` bodies work (`duplex: "half"`) where supported; backpressure kept; observation does not buffer                                       |
| Cancellation      | Abort before send, during upload, during download; a returned stream remains bound to the caller signal and call timeout after the operation resolves; cancelling propagates to the underlying stream            |
| Timeouts, retries | Existing `retry`/`timeout`/idempotency semantics preserved; retry restarts progress with a new `attempt` and an event; non-replayable bodies never retried; interrupted body reads classified consistently       |
| Middleware        | Request/response/error middleware unchanged and run once per logical call; events never pass through a second path; binary-safe transformations stay skipped                                                     |
| Mock path         | Mocked resources emit the same lifecycle events for blob/arrayBuffer/text/json results so progress UI is testable; no fake byte-level pacing; `stream` stays `MOCK_UNSUPPORTED` unless Batch 0 decides otherwise |
| Types             | `onTransfer` typed through builtins, custom operations, `ctx.request()`, `useResourceQuery`, `useResource`, `useResourceMutation`, packed npm declarations; result inference unchanged                           |
| Errors            | Interrupted-transfer classification into existing `AbortError` / `TimeoutError` / `NetworkError`; a new error class only if Batch 0 proves one is needed                                                         |
| Tests             | Characterization first, runtime, compile-time, mock and live, reliability, React 18/19, packed npm consumers, Chromium, Node, Next, Vercel Edge, workerd                                                         |
| Docs and example  | `docs/architecture.md`, `docs/public-api.md`, README, Core README; one `examples/next` transfer scenario; story and roadmap                                                                                      |

## Out of scope

| Item                                                                                   | Why                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Chunked uploads, resumability, ranges, parallel transfers, checkpoints                 | Roadmap phase 8                                 |
| Presigned URLs, S3 / cloud / storage adapters                                          | Roadmap phase 8                                 |
| Advanced mock storage (disks, fixtures, lifecycle), simulated network speed or latency | Roadmap phase 6                                 |
| File validation policies, size limits                                                  | Roadmap phase 5                                 |
| React Hook Form and other framework form adapters; progress UI components              | Separate optional milestone                     |
| A second transport/client (for example an `XMLHttpRequest` client), a new package      | Violates the one-pipeline rule; see decision D2 |
| New retry policies, new backoff, new idempotency rules                                 | Existing contract is kept                       |
| Changing default upload/download behavior, JSON behavior, or existing error text       | Compatibility                                   |
| Automatic browser downloads / save dialogs                                             | Application concern                             |
| Vue, Angular, new framework packages                                                   | Not in any current scope                        |

## Affected packages

| Package                      | Change                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (private)    | `types/transport.ts`, `types/inference.ts`, `types/builtins.ts`, `types/definition.ts`, `transport/fetch.ts`, `transport/read-body.ts`, `request/pipeline.ts`, `http/body.ts`, new `transfer/` module (counting streams, capability probe, event emitter), mock `finalizeMockResponse` events |
| `packages/mocking` (private) | re-export of new public types only, if any                                                                                                                                                                                                                                                    |
| `packages/react` (private)   | **no source change expected**: `onTransfer` rides on existing option types; type/runtime verification only. Any change needs a reason                                                                                                                                                         |
| `apixa` facade (`src/`)      | explicit re-exports of additions; `tests/facade/curated-root-exports.json` and the snapshot                                                                                                                                                                                                   |
| `scripts/`                   | `verify-type-consumers.mjs`, `verify-unified-consumer.mjs`, `verify-edge.mjs`, `verify-browser.mjs`, fixtures                                                                                                                                                                                 |
| `examples/next`              | one transfer scenario; no other example touched                                                                                                                                                                                                                                               |

No new workspace packages and no new dependencies.

## Compatibility requirements

- Without `onTransfer` (or its operation default) no body is wrapped, no extra read happens and the
  `TransportRequest` passed to a custom transport is identical to v1.2.0 (new fields only when
  opted in).
- `Transport` stays one method. Any new field is optional; a transport that ignores it still works.
  Capability is detected, and unsupported cases are reported.
- Existing result types, `full`, `responseType` precedence, error classes and `HttpError.data`
  rules are unchanged. All v1.1.0 / v1.2.0 tests pass **without edits**.
- A `stream` result remains `ReadableStream<Uint8Array> | null`; its additional cancellation and
  timeout binding must not change the bytes or ordering a consumer sees.
- Public API changes are additions only, recorded in `docs/public-api.md` and the snapshot.

## Boundaries

- Core imports nothing (no React, TanStack, `node:*`). Observation uses standard streams only.
- Hooks never expose `full`; `onTransfer` is a plain per-call option and is **not** part of query
  keys or cache identity.
- Mocking stays decoupled from production execution; mock events come from the pipeline's existing
  mock branch, not from a mock-owned transport.
