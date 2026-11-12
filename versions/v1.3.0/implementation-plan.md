# v1.3.0 — Implementation plan

Ordered smallest path. Prefer reshape over new packages. Batch 0 is a spike that locks the design
decisions below; nothing ships before its results are recorded in this file.

## Design decisions to lock (Batch 0)

| #   | Decision                     | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Event API shape              | One option `onTransfer?: (event: TransferEvent) => void` on `RequestOptions` and as an operation default. `TransferEvent` = `{ direction: "upload"\|"download"; phase: "start"\|"progress"\|"complete"\|"error"\|"abort"; loaded: number; total?: number; attempt: number; ... }` discriminated on `phase`. Sync, errors in the callback are swallowed (reported via `meta`/console never thrown). No per-direction callbacks. |
| D2  | Upload observation mechanism | Count bytes consumed from a wrapped request stream (`Blob.stream()` / serialized `FormData` via `Response`) **only when `onTransfer` is set** and the runtime supports streaming request bodies with `duplex: "half"`. No `XMLHttpRequest` fallback in v1.3.0 (a second execution path, absent in Node/Edge). Otherwise emit one honest `unsupported` signal and no `progress`.                                                |
| D3  | Meaning of upload `loaded`   | Bytes handed to the runtime's network stack, not server-acknowledged. Documented; a `complete` upload event fires only when the response head arrives, and never means "server processed it".                                                                                                                                                                                                                                  |
| D4  | Wire-behavior risk           | Streaming a known-size `Blob`/`FormData` can drop `Content-Length`, force chunked encoding and needs HTTP/2+ in browsers. Spike must prove which runtimes keep `Content-Length`; if wrapping changes the wire form, uploads in that runtime report `unsupported` instead.                                                                                                                                                      |
| D5  | Download observation         | In `fetch` transport, replace `response.blob()/arrayBuffer()/text()` by reading a counted `response.body` reader only when observing; otherwise keep today's calls. Result bytes must equal the unobserved path (tested).                                                                                                                                                                                                      |
| D6  | Trustworthy `total`          | `Content-Length` finite, ≥ 0, response has no `Content-Encoding` (decoded size differs), not a 204/205/HEAD. Otherwise `undefined`. `loaded > total` clamps nothing and drops `total`.                                                                                                                                                                                                                                         |
| D7  | `stream` result + progress   | Wrap the returned stream in a counting `TransformStream`/reader pass-through preserving backpressure, cancellation and ordering, emitting download progress as the consumer pulls. Falls back to the raw body when `TransformStream` is missing.                                                                                                                                                                               |
| D8  | Stream lifetime              | Keep the call signal and timeout alive until a streamed body ends, errors or is cancelled (cleanup moves from `finally` to stream end). Timeout is the overall call budget (documented); stalled streams hit it. Non-stream calls unchanged.                                                                                                                                                                                   |
| D9  | Transport seam               | Add optional `onTransfer`-style hooks to `TransportRequest` (`onUploadProgress`, `onDownloadProgress`) that a transport may honor; fetch transport honors them; a custom transport that ignores them yields lifecycle events but no `progress`, reported as unsupported.                                                                                                                                                       |
| D10 | Interrupted-transfer errors  | Reuse `NetworkError` / `AbortError` / `TimeoutError`; attach `loaded`/`total`/`direction` as optional fields. No new class unless the spike shows existing ones cannot carry them.                                                                                                                                                                                                                                             |
| D11 | Retry + events               | Each attempt emits `start` with its `attempt`; progress restarts at 0 for the new attempt; a failed attempt emits `error` with `willRetry`. Final outcome is exactly one of `complete` / `error` / `abort` per call.                                                                                                                                                                                                           |
| D12 | Mock path                    | Mocked calls emit `start` → one `progress` at full size (blob/arrayBuffer/text, known size) → `complete`; no paced fake bytes. Mocked `stream` stays `MOCK_UNSUPPORTED`.                                                                                                                                                                                                                                                       |
| D13 | Capability reporting         | Exported pure `detectTransferSupport()` returning booleans (`uploadProgress`, `streamingUpload`, `downloadProgress`, `streamTransform`) from runtime feature probes; never from user-agent sniffing.                                                                                                                                                                                                                           |

## Spike results and locked decisions (Batch 0, recorded)

`scripts/spike-transfer-runtimes.mjs` (Node 24) and the verification scripts probed the real runtimes:

| Question                                              | Node 24 (undici)                      | Vercel Edge Runtime | Chromium (1248, HTTP/1.1 loopback)                         | workerd (2026-11-09)                                        |
| ----------------------------------------------------- | ------------------------------------- | ------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Stream request body without `duplex`                  | **throws** (confirms gap 3)           | n/a                 | n/a                                                        | n/a                                                         |
| Stream body with `duplex: "half"`                     | works, sent `chunked`                 | probe: supported    | probe: supported; **refused on HTTP/1.1** (`NetworkError`) | probe: **not supported**                                    |
| Stream + explicit `Content-Length` and `Content-Type` | wire form identical to a plain `Blob` | probe: supported    | `Content-Length` is forbidden: dropped                     | n/a                                                         |
| `FormData` via `Response` → `Blob` → counted stream   | identical bytes, boundary and length  | covered by probes   | `uploadProgress` false → sent untouched                    | n/a                                                         |
| `detectTransferSupport()`                             | all true                              | all true            | `streamingUpload` true, `uploadProgress` **false**         | `streamingUpload`/`uploadProgress` **false**, download true |

Locked decisions: **D1** one `onTransfer` observer, sync, errors/rejections swallowed. **D2** no XHR.
**D3** upload `loaded` = bytes pulled by the runtime, documented. **D4** a sized body is observed only
when `Content-Length` can be kept (probe `Request` ignores/keeps the forbidden header); otherwise
`unsupported` and the body is sent untouched; caller streams are counted wherever streaming bodies
exist. **D5** the existing `readBody` reads a counted copy of the body, so results are byte-equal.
**D6** total = finite `Content-Length`, no `Content-Encoding`, not 204/205/304/HEAD; dropped if
exceeded. **D7** counting is pull-based (`highWaterMark: 0`) in the transport, lifetime binding in the
pipeline. **D8** stream cleanup moved from `finally` to stream end. **D10** no new error class;
optional `ApiError.transfer`. **D11** one sequence per attempt, `willRetry` on `error`. **D13** as
specified (four booleans).

Deviations from the recommendations (each consistent with the contract's intent):

- **D9** is one callback, `TransportRequest.onTransfer(event)`, not separate upload/download hooks;
  fewer concepts, same capability. A transport that ignores it is reported `unsupported`.
- **D1/D11** add an `unsupported` phase to the union (the contract promised an "unsupported signal").
- **D11** "exactly one terminal event per call" is per direction that started; aborting before
  anything was sent starts nothing and emits no event (the call rejects with `AbortError` and never
  reaches the transport).
- **D12** mocked JSON results and mocked request bodies report `unsupported` rather than invented
  sizes; binary and text results report their real size.
- Observed uploads of `FormData`/strings are serialized into memory first (`Response` → `Blob`) to
  know the exact length; a `Blob`/`File`/buffer is streamed lazily and caller streams are never
  buffered.
- Extra, needed for the headline use case: call-option generics now accept
  `O | RequestOptions<Query>` so an inline `onTransfer: (event) => …` is contextually typed (before,
  inline callbacks in call options, including `retry.shouldRetry`, were implicitly `any`).
- Browser verification (`scripts/verify-browser.mjs`) runs a loopback server with the packed ESM
  instead of adding a page to `examples/frontends/query-ssr-next` (only `examples/frontends/next`, which is untracked
  here, may be edited).

## Batches

### Batch 0 — Audit, characterization and spike (no production change)

- Characterization tests for current behavior (written first, must pass on today's code):
  stream response abort/timeout after resolve (**expected to expose gap 2**), `ReadableStream`
  request body never retried and its `duplex` behavior in Node, mid-body failure classification,
  `Content-Length`/`Content-Encoding` handling, FormData body headers.
- Spike script (not shipped) probing Node, Chromium, workerd and Vercel Edge: streaming request
  body, `duplex`, `Content-Length` retention for wrapped `Blob`/`FormData`, `TransformStream`
  backpressure. Record results in a "Spike results" section here and lock D1–D13.

### Batch 1 — Types and capability probe

- `types/transport.ts`: `TransferEvent`, `TransferPhase`, `TransferDirection`,
  `TransferObserver`; `RequestOptions.onTransfer`; optional `TransportRequest` observers (D9).
- `types/definition.ts`: operation-level default; `types/builtins.ts` `ctx.request` init.
- `transfer/support.ts`: `detectTransferSupport()`. Compile-time tests in
  `tests/core/transfer-types.test.ts` first.

### Batch 2 — Counting primitives

- `transfer/counting.ts`: byte-counting stream/reader wrappers, trustworthy-total helper,
  observer emitter (once-only terminal event, swallowed callback errors). Unit tests with fake
  streams: byte integrity, backpressure (slow consumer), cancel propagation, zero-length.

### Batch 3 — Download progress

- `transport/read-body.ts` / `fetch.ts`: observed read path for blob/arrayBuffer/text/json (D5),
  unobserved path untouched. Pipeline emits `start`/`complete`/`error`/`abort` with `attempt`.
  Tests: known/unknown/untrustworthy total, error bodies (`HttpError`) emit `error`, equality of
  observed vs unobserved results.

### Batch 4 — Stream lifetime and cancellation

- `request/pipeline.ts`: D8 (signal + timeout bound to a streamed body, cleanup at stream end);
  D7 counting stream result. Tests: abort after resolve cancels the reader, timeout mid-stream,
  consumer cancel releases listeners/timer, no leak, backpressure preserved.

### Batch 5 — Upload progress and streaming bodies

- `http/body.ts` / `fetch.ts`: observed upload path for Blob/File/FormData/multipart/buffers/
  strings (D2–D4), `duplex: "half"` for stream bodies; replayability still decides retry.
  Tests: known/unknown totals, `unsupported` signal, wire headers (Content-Length / multipart
  boundary) unchanged or honestly degraded, stream body never retried, abort mid-upload.

### Batch 6 — Retries, timeouts, middleware, mocks

- Retry attempts (D11), interrupted classification (D10), middleware runs once per logical call,
  binary-safe skip preserved, mock lifecycle events (D12). Regression: all existing retry,
  idempotency, middleware, mock tests pass unedited.

### Batch 7 — Type inference through every surface

- Typed `onTransfer` on builtins, custom ops, `ctx.request`, `useResourceQuery`, `useResource`,
  `useResourceMutation`; no `any`; result inference unchanged. Extend
  `scripts/verify-type-consumers.mjs` and fixtures; React 18/19 runtime test.

### Batch 8 — Runtimes, example, docs, public API

- `verify-unified-consumer.mjs` (Node + Next SSR), `verify-browser.mjs` (Chromium upload/download
  progress and abort), `verify-edge.mjs` (Vercel Edge, workerd; assert honest `unsupported` where
  applicable). `examples/frontends/next` one scenario. Docs: architecture (Transfer section),
  `public-api.md`, READMEs, story; `node scripts/verify-public-api.mjs --update` and review the
  snapshot. Tick acceptance criteria only with evidence; run complete `pnpm verify`.

## Expected file changes

`packages/core/src/`: `types/{transport,definition,builtins,inference,index}.ts`,
`transfer/{support,counting,index}.ts` (new), `transport/{fetch,read-body}.ts`,
`request/pipeline.ts`, `http/body.ts`, `mock/files.ts` (events only), `index.ts`;
`packages/mocking/src/index.ts` (re-exports if any); `src/index.ts`;
`tests/core/{transfer-*,stream-*}.test.ts`, `tests/react/transfer.test.tsx`;
`tests/facade/*`; `scripts/verify-*.mjs`, `scripts/lib/type-consumer-fixtures.mjs`;
`examples/frontends/next/**` (one scenario); docs and `versions/v1.3.0/*`.

## Verification strategy

- Failing/characterization tests first; fake `Transport` and in-memory streams for the primary
  suite (no live network). Real `fetch` only in the Node/Chromium/Edge verification scripts against
  local servers.
- Compile-time tests with `Assert`-style helpers at call sites (no `any` workarounds).
- Packed-tarball consumer matrix (core-only, React 18/19, TS 5.5.4 / 5.9.3 / latest, bundler and
  nodenext, `skipLibCheck` on/off).
- Final gate: `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck &&
pnpm test && pnpm verify:consumers && pnpm verify:browser && pnpm verify:edge` (i.e. `pnpm verify`).

## Explicit non-steps

No `XMLHttpRequest` transport, no new package or dependency, no chunking/resume/ranges/parallelism,
no storage adapters or presigned URLs, no validation or size limits, no paced or simulated mock
transfer speed, no React Hook Form, no change to existing defaults or error text, no commit,
publish or version bump as part of implementation.
