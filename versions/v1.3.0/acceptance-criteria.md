# v1.3.0 — Acceptance criteria

Tick an item only with verified evidence (test name, command output or script result).

## Design and audit

- [x] Batch 0 characterization tests exist, pass on unmodified behavior, and the gaps in `context.md` (stream escapes cancellation/timeout, stream request body `duplex`, interrupted-transfer classification) are each reproduced or disproved
- [x] Spike results for Node, Chromium, workerd and Vercel Edge are recorded in `implementation-plan.md` and decisions D1–D13 are locked there
- [x] No existing v1.1.0 / v1.2.0 test was edited to make this milestone pass

## Lifecycle and progress API

- [x] A single opt-in `onTransfer` option exists on `RequestOptions` and as an operation default; per-call wins
- [x] Events are discriminated (`direction`, `phase`) and cover `start`, `progress`, `complete`, `error`, `abort`, each with `attempt`
- [x] Exactly one terminal event (`complete`, `error` or `abort`) per started direction and attempt; none after it
- [x] A throwing callback never changes the call result or breaks the transfer
- [x] Without `onTransfer` nothing is wrapped: the `TransportRequest` seen by a custom transport equals v1.2.0's and results are byte-identical

## Download progress

- [x] Progress works for `blob`, `arrayBuffer`, `text`, `json` and `stream` responses; observed and unobserved results are byte-equal
- [x] `total` equals `Content-Length` only when trustworthy (finite, no `Content-Encoding`, not contradicted); otherwise `undefined`, and no percentage is ever derived without a total
- [x] Failed (non-2xx) downloads emit `error` and still surface `HttpError` with its readable body
- [x] A 204/205 response completes with `loaded: 0`

## Upload progress and streaming

- [x] Upload progress for `File`, `Blob`, `FormData`, multipart, buffers/strings and stream bodies where the runtime supports it, with `total` known only when the size is known
- [x] Unsupported runtimes/bodies emit an explicit `unsupported` signal and **no** `progress` events (verified in at least one runtime without upload observation)
- [x] `loaded` semantics (bytes handed to the network stack, not acknowledged) and `complete` semantics are documented, and no event claims server acknowledgment
- [x] Request headers and wire form (`Content-Length`, multipart boundary, `Content-Type`) are unchanged by observation, or the call reports `unsupported` instead of changing them
- [x] `ReadableStream` request bodies send successfully (`duplex: "half"`) where supported and are never retried
- [x] Streaming a large body is not buffered in memory (test with a stream larger than a fixed buffer budget) and preserves backpressure and byte order

## Cancellation, timeouts, retries

- [x] Abort during upload and during download each reject with `AbortError`, emit `abort` once and stop reading; abort before send rejects with `AbortError`, never reaches the transport and emits no event (nothing started)
- [x] A `stream` result stays bound to the caller signal and to the call timeout after the operation promise resolves; aborting or timing out mid-stream errors/cancels the stream with the right error type
- [x] Cancelling a consumed stream releases the timer and signal listeners (no leak) and cancels the underlying body
- [x] Mid-body connection failure is classified consistently (`NetworkError` / `TimeoutError` / `AbortError`) and carries `direction`/`loaded`/`total` when known
- [x] Retry policy, `Retry-After`, idempotency keys and the overall timeout budget behave as in v1.2.0; each retry emits `start` with the new `attempt` and progress restarts at 0; failed attempts report whether a retry follows
- [x] A non-replayable body is never retried, with and without observation

## Middleware and mocks

- [x] Request/response/error middleware runs once per logical call, receives unchanged binary data, and no second execution path exists for observed calls
- [x] Binary results still skip key transforms and JSON shaping
- [x] Mocked resources emit the lifecycle for blob/arrayBuffer/text with their real size and `unsupported` for JSON results and request bodies (no fabricated bytes); mocked `stream` behavior is as decided in D12 and documented
- [x] Mock isolation, reset and `MOCK_NOT_FOUND` behavior unchanged

## Types

- [x] `onTransfer` is typed on builtin operations, custom operations, `ctx.request()`, `useResourceQuery`, `useResource` and `useResourceMutation`; existing result inference (including `Blob`/`ArrayBuffer`/`string`/stream and `full`) is unchanged
- [x] Compile-time tests cover each surface, with no `any` and no `@ts-ignore` workaround; hook results are checked for `IsAny`
- [x] `onTransfer` is not part of query keys or cache identity (test)
- [x] Types hold in packed npm declarations across the consumer matrix

## Runtimes and compatibility

- [x] `detectTransferSupport()` (or the decided equivalent) reports capabilities from feature probes and is tested with stubbed runtimes
- [x] Node: download/upload/stream/abort verified through packed consumers
- [x] Chromium: real download progress and abort verified in `verify:browser` against the Next example; upload behavior matches the documented capability
- [x] Vercel Edge Runtime and workerd verified, including honest `unsupported` where applicable
- [x] Next.js SSR (`next start` and `next dev`) consumer still builds and renders, including a Server Component download with `onTransfer`
- [ ] React 18 and 19 hook tests pass for `onTransfer` at runtime (hook runtime tests run on the workspace React 19 only; packed React 18/19 consumers verify types, build and SSR, not a transfer runtime test under 18)
- [x] Core still has no framework or `node:*` imports; `pnpm check:architecture` passes; no new package or dependency

## Public API, docs, example

- [x] Public API changes are additions only, recorded in `docs/public-api.md`; snapshot reviewed after `node scripts/verify-public-api.mjs --update`
- [x] `docs/architecture.md` (transfer section), `docs/public-api.md`, README and Core README document events, limits per runtime and the honesty rules, marking implemented vs planned
- [x] `examples/next` shows one transfer scenario (progress + abort); no other example touched
- [x] `docs/story.md`, `docs/roadmap.md`, `docs/context.md` and `versions/README.md` reflect the implemented state

## Verification gate

- [x] `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck && pnpm test` pass
- [x] `pnpm verify:consumers`, `pnpm verify:browser`, `pnpm verify:edge` pass
- [x] Complete `pnpm verify` passes

## Evidence

- **Design/audit:** `tests/core/transfer-characterization.test.ts` (preserved behavior; the two stream-lifetime gaps were reproduced green on v1.2.0 code first, then replaced by `stream-lifecycle.test.ts`); duplex gap reproduced by `scripts/spike-transfer-runtimes.mjs` (real undici throws). Spike table and D1–D13 in `implementation-plan.md`. No existing test file was modified (`git status` shows only new test files plus the facade snapshot).
- **Events, download, upload, streams, reliability, mocks:** `tests/core/transfer-counting.test.ts`, `download-progress.test.ts`, `upload-progress.test.ts` (incl. loopback socket wire equality and a 48 MiB streamed body read at most 4 chunks ahead), `stream-lifecycle.test.ts`, `transfer-reliability.test.ts`, `transfer-mock.test.ts`.
- **Types:** `tests/core/transfer-types.test.ts`, `tests/react/transfer.test.tsx` (incl. `IsAny` and the query-key test); packed declarations 62/62 (`scripts/verify-type-consumers.mjs`).
- **Runtimes:** Node packed consumer with loopback server and Next SSR (`scripts/verify-unified-consumer.mjs`); Chromium (`scripts/verify-browser.mjs`: download progress with total, Blob upload `unsupported` yet byte-exact with Content-Length, HTTP/1.1 stream upload refused as `NetworkError`, abort and stream ownership); Vercel Edge and workerd (`scripts/verify-edge.mjs`: workerd reports `unsupported` uploads).
- **Gate:** `pnpm verify` exit 0: 97 files / 1061 tests, architecture check, public API snapshot, 62/62 type consumers, unified consumer, Chromium (4 checks), Edge and workerd.

## Sign-off

- [ ] Owner sign-off
