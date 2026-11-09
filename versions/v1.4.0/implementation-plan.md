# v1.4.0 — Implementation plan

Ordered smallest path. Prefer reshape over new packages. Batch 0 locks the decisions below with
characterization tests and a small spike; nothing ships before they are recorded in this file.

## Baseline audit (v1.3.0 tree)

| Fact                                                                                                                                                                     | Consequence                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Order in `runOperation`: headers → request middleware → key transform → (live) `sendWithRetry` → `serializeBody` → transport; (mock) `runMockHandler`/`runMockWithFiles` | The validation checkpoint is **after key transform, before both branches**, run once per logical call (never per retry)               |
| `fileFields` is parsed in `prepareFiles` into wire names only; `OperationDefinition` has no `fileFields`                                                                 | Rules extend `FileFieldOptions`; `prepareFiles` resolves them; operation-level override is new                                        |
| `containsBinary` walks plain objects/arrays to depth 32 with a `seen` set; `serializeMultipart` has the same traversal                                                   | Reuse one bounded walk to _collect_ files (path + `Blob` metadata); do not write a third walker                                       |
| `serializeBody` passes `FormData`, `Blob`, buffers, strings, `URLSearchParams`, `ReadableStream` through unchanged                                                       | Each needs an explicit rule: `FormData` entries are walked; `Blob`/buffer raw bodies use the request limits; streams are counted only |
| `ValidationError` (`VALIDATION`, `retryable: false`, default message "Response validation failed") is thrown only for missing path params                                | Reuse, add optional typed `violations`; give file violations their own message                                                        |
| `countedStream` (v1.3.0) is pull-based, `highWaterMark: 0`, observer hooks swallow errors                                                                                | Add an optional byte `limit` that errors the stream; keep the no-limit path unchanged                                                 |
| `fetch.ts` wraps bodies/streams **only when `onTransfer` is set**                                                                                                        | A size-limited stream must be wrapped **without** an observer; wrapping becomes "observer or limit"                                   |
| Aborting a fetch whose request stream errors yields a generic `TypeError` → `NetworkError`                                                                               | The pipeline must surface the original `ValidationError` (stash the cause on the counted stream)                                      |
| Mock branch never serializes; `finalizeMockResponse` knows the real byte size of binary/text results                                                                     | Mock request validation uses the shared validator; mock response limit is exact                                                       |
| `readBody` buffers blob/arrayBuffer/text via `Response` methods; v1.3.0 reads through a counted copy only when observing                                                 | Response limit needs the counted read path whenever a limit is set                                                                    |
| Retry: `decideRetry` consults `retryable`/status; a `ValidationError` is `retryable: false`                                                                              | Test that a pre-send and a mid-download violation are never retried                                                                   |
| Hooks pass call options to Core unchanged; `normalizeIdentity` strips transport-only options from query keys                                                             | Per-call overrides (if any) must be added there; config rules never enter keys                                                        |

## Design decisions to lock (Batch 0)

| #   | Decision                 | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Where rules live         | On `FileFieldOptions` (`maxSize`, `minSize`, `min`, `max`, `accept`, `reject`, `extensions`, `unknownType`, `filename`), beside the existing `name`. The array shorthand stays rule-free. No new top-level `validation` key.                                                                                                                                                                                                    |
| V2  | Request-level limits     | A single optional operation/resource key `fileLimits: { maxTotalSize?, maxFiles?, maxBodySize? }` (resource default, operation overrides, key-wise merge). `maxBodySize` covers raw `Blob`/buffer/stream bodies that have no field.                                                                                                                                                                                             |
| V3  | Precedence               | per-call override (only if Batch 0 proves it necessary; recommended: **none**, config only) > operation `fileFields[field]` > resource `fileFields[field]` > no rule. Field rules merge key-wise; a defined operation value (including `0`/`false`) wins.                                                                                                                                                                       |
| V4  | Units and shape          | Sizes are integer bytes (no string parsing, no helper); `accept`/`reject` are string arrays of MIME patterns (`type/sub`, `type/*`) and `.ext` entries; `extensions` allow-list without dots is **not** offered (one syntax: `accept`).                                                                                                                                                                                         |
| V5  | MIME semantics           | Compare the caller-declared `File.type`, lower-cased, parameters stripped. `reject` beats `accept`. Empty type → `unknownType: "reject" \| "allow"` (default **allow** unless the field has MIME-only `accept`... locked by spike; if unsure, `"reject"` only when `accept` is set). Documented as unauthenticated.                                                                                                             |
| V6  | Extension semantics      | Last `.segment` of `File.name`, lower-cased; none → `noExtension: "allow" \| "reject"` (default allow when no `.ext` entries in `accept`). `filename: "strict"` adds the suspicious-name check; off by default. Never inferred from MIME.                                                                                                                                                                                       |
| V7  | Total and count counting | Count/size only items matched to a _declared field or any file-like in the body_; an unconfigured field's files count toward `maxTotalSize`/`maxFiles` only. Zero-byte files are valid unless `minSize >= 1`.                                                                                                                                                                                                                   |
| V8  | Non-file bodies          | JSON/strings are not files and are ignored. `FormData` is walked by entries (part name = field, wire alias respected). Raw `Blob`/buffer: `maxBodySize`/`maxTotalSize`. `ReadableStream`: only `maxBodySize`/`maxTotalSize` via counting; `minSize`/MIME/ext/count cannot apply and are reported as **not evaluated**, never passed silently.                                                                                   |
| V9  | Stream enforcement       | `countedStream` gains an optional `limit`; exceeding it errors the stream with the `ValidationError` and the transport surfaces that error instead of `NetworkError`. Requires no `onTransfer`. Honest note: earlier bytes may be sent.                                                                                                                                                                                         |
| V10 | Response limits          | `maxResponseSize` on the operation and per call; `accept` on the operation for response `Content-Type` (server-declared, not proof). Early reject only from a trustworthy `Content-Length` (v1.3.0 rule); counting is authoritative.                                                                                                                                                                                            |
| V11 | Response + stream result | A `stream` result with a limit errors the consumer's stream when exceeded (`ValidationError`), ending the call through the existing stream-lifetime binding. No buffering added.                                                                                                                                                                                                                                                |
| V12 | Error shape              | `ValidationError.violations: readonly FileViolation[]` where `FileViolation = { code, path, limit?, actual?, rule? }`; codes: `FILE_TOO_LARGE`, `FILE_TOO_SMALL`, `TOO_MANY_FILES`, `TOO_FEW_FILES`, `TOTAL_TOO_LARGE`, `TYPE_NOT_ALLOWED`, `EXTENSION_NOT_ALLOWED`, `UNSAFE_FILENAME`, `BODY_TOO_LARGE`, `RESPONSE_TOO_LARGE`, `RESPONSE_TYPE_NOT_ALLOWED`. Cap at 20 violations. No file names or bytes in message or fields. |
| V13 | Collect vs fail fast     | Pre-send: collect all violations (bounded) in one `ValidationError`; mid-stream: first violation.                                                                                                                                                                                                                                                                                                                               |
| V14 | Checkpoint timing        | After request middleware and key transform; **once**, before `sendWithRetry`/mock branch; `replay()` re-runs the whole call and therefore re-validates. Not run when `serializeBody` throws first? Order locked: validation before serialization.                                                                                                                                                                               |
| V15 | Opt-out                  | None per call (config only), unless Batch 0 finds a backend case that needs it; then a single `RequestOptions` flag, stripped from query identity.                                                                                                                                                                                                                                                                              |
| V16 | Mock parity              | Same validator (same function) in the mock branch before `runMock*`; mock responses checked with the exact byte size; no store mutation on reject.                                                                                                                                                                                                                                                                              |
| V17 | Events                   | Pre-send violation: no transport, no `onTransfer` event. Mid-transfer: normal `error` event, `willRetry: false`, `ApiError.transfer` set.                                                                                                                                                                                                                                                                                       |

## Spike results and locked decisions (Batch 0, recorded)

`scripts/spike-file-validation.mjs` (Node 24 / undici) and the verification scripts (Chromium, workerd,
Vercel Edge) established:

- A request stream that errors mid-send makes `fetch` reject with `TypeError: fetch failed` whose
  `cause` is the original error; the source had been pulled a few times before the error. So the
  pipeline keeps the limit error itself and surfaces it instead of the generic failure (V9).
- `File.type` is lower-cased by the runtime and keeps parameters (`text/plain; charset=utf-8`), is `""`
  for unknown extensions (`.heic`); `File.name` keeps separators, NUL and long names; a plain `Blob`
  has no `name` and is sent as `blob`; a zero-byte `File` has `size` 0 and a `Blob` in `FormData`
  becomes a `File` named `blob`.
- Chromium and workerd behavior for streams was already measured in v1.3.0 (workerd: no streaming
  upload; Chromium: HTTP/1.1 refuses it) and is unchanged; limits do not depend on it.

Locked: **V1** rules on `FileFieldOptions`; **V2** one `fileLimits` (`maxTotalSize`, `maxFiles`,
`maxBodySize`), resource default, operation key-wise override; **V3** operation `fileFields[field]` >
resource `fileFields[field]`, key-wise, a defined value (even `0`/`false`) wins, no per-call layer;
**V4** integer bytes only, `accept`/`reject` with MIME, wildcard and `.ext` entries (one syntax);
**V5** MIME compared lower-cased without parameters, `reject` beats `accept`, an allow-list defaults to
`unknownType: "reject"` and `"allow"` is opt-in (without `accept` there is nothing to decide);
**V6** extension = last segment, `.tar.gz`-style suffix entries match, dotfiles have no extension,
`noExtension` default `"allow"`, `filename: "strict"` opt-in; **V7** zero-byte files are valid unless
`minSize >= 1`; files outside declared fields count toward the request limits only; `min` applies
only to a present field; **V8** raw bodies use `maxBodySize`/`maxTotalSize` only; **V9** counting
stream `limit`, original error surfaced; **V10** `maxResponseSize` on operation and call; **V11**
stream results counted in the pipeline; **V12** codes as specified, `violations` capped at 20;
**V13** collect all pre-send, first mid-stream; **V14** after middleware and key transforms, once per
logical call, `replay()` re-validates; **V15** no per-call opt-out; **V16** same function in the mock
branch; **V17** no event pre-send, `error` event mid-transfer.

Deviations (each within the contract's intent):

- Response content-type allow-list is `responseAccept` (not `accept`) so it cannot be confused with the
  request-side `accept`.
- Rules that cannot apply to a raw body (MIME, extension, counts) are documented as not applying rather
  than reported at runtime; a raw body is governed by `maxBodySize` / `maxTotalSize` only.
- A transport may enforce `TransportRequest.limits`; the pipeline also checks heads and fully read bodies
  for custom transports, and counts `stream` results itself.
- `maxSize`, previously the example of an "unknown field option" in two v1.1.0 tests
  (`file-requests.test.ts` config table, `file-fields-types.test.ts`), is now a valid option; those two
  examples were changed to `bogus`. These are the only edits to existing tests.
- `maxResponseSize` is stripped from React query identity (`query-options.ts`), like `timeout`.
- Failed (non-2xx) responses keep their status and `HttpError` (a limit must not hide the status or
  change retry behavior), but the fetch transport bounds their body with the same limit: a declared or
  counted oversize error body is dropped (`data: null`) instead of being buffered. The contract was
  silent on this; leaving error bodies unbounded would have been a safety gap, so it was closed.
- The `examples/next` scenario is untracked in this checkout and was type-checked but not driven in a
  browser; the packed-consumer and Chromium scripts drive the behavior.

## Batches

### Batch 0 — Audit, characterization, decisions (no production change)

- Characterization tests (pass on today's code, `tests/core/file-validation-characterization.test.ts`):
  no limits exist (huge/odd files sent), order middleware → serialization, `ValidationError` shape and
  the path-parameter thrower, stream body counted only with `onTransfer`, mock write stores any file,
  aborted fetch with a failing request stream surfaces `NetworkError`.
- Spike script (not shipped, `scripts/spike-file-validation.mjs`): how undici, Chromium-like and
  workerd behave when a request stream errors mid-send (which error surfaces, are earlier bytes sent),
  and `File.type` / `name` edge cases (empty type, parameters, no extension, unicode, long names).
- Record results in "Spike results" here and lock V1–V17 (owner escalation only for a conflict with an
  established public contract).

### Batch 1 — Types, config, resolution

- `types/definition.ts`: rule fields on `FileFieldOptions`, `fileLimits`, operation `fileFields`,
  `maxResponseSize` / response `accept`; `api/validate.ts`: strict validation (`ConfigError`) of every
  rule (types, negative/NaN sizes, `min > max`, malformed `accept`); `api/resource-client.ts`
  (`prepareFiles`): resolve precedence into a frozen per-operation `FileRules` (or `undefined`
  when nothing is configured — the zero-cost default). Compile-time tests first.

### Batch 2 — Pure validator

- New `packages/core/src/validation/` (`collect.ts`, `rules.ts`, `index.ts`): bounded body walk
  (reusing the multipart traversal rules), rule evaluation over `{ path, size, type, name }`,
  MIME/extension/filename helpers, violation capping. No I/O, no globals beyond `Blob`/`File`/`FormData`.
  Exhaustive unit tests (table-driven: sizes incl. 0, counts, MIME wildcards/case/params, unknown,
  extensions, no extension, unicode, overlong, nested, arrays, `FormData`, cycles, depth bound).

### Batch 3 — Pipeline checkpoint (requests)

- `request/pipeline.ts`: call the validator once after request middleware/key transform, before both
  branches; throw `ValidationError` (V12). Builtins, custom declarative operations, function
  operations and `ctx.request()`. Tests: no transport call, no events, no retry, middleware ordering,
  `replay()`, error middleware sees it, abort-before-validate precedence.

### Batch 4 — Streams and responses

- `transfer/counting.ts`: optional `limit`; `transport/fetch.ts`: wrap for observer **or** limit; surface
  the stashed `ValidationError`; response limit via counted read (`readBody` unchanged), early
  `Content-Length` reject that cancels the body, stream result limit through the existing lifetime
  binding. Tests: byte-exact under the limit, exact-limit boundary, over by one byte, no read-ahead,
  slow consumer, unknown length, compressed response, abort/timeout interplay, mid-transfer event.

### Batch 5 — Errors, mocks, retries, transfer integration

- `errors/validation-error.ts` typed `violations`; mock branch uses the validator and exact response
  sizes; mock isolation tests (rejected write leaves the store); retry tests (never retried; valid
  attempts unaffected); `onTransfer` interplay tests.

### Batch 6 — Types through every surface

- Typed rules in builtins/custom/`ctx.request()`/hooks; `ValidationError.violations` narrowing;
  `IsAny` checks; `scripts/verify-type-consumers.mjs` fixtures; React 18/19 runtime tests including a
  hook mutation rejected by a rule and `onTransfer`/rules coexistence.

### Batch 7 — Runtimes, example, docs, public API

- `verify-unified-consumer.mjs` (Node + Next SSR), `verify-browser.mjs` (Chromium: size/MIME rejection
  with no request reaching the server, stream limit), `verify-edge.mjs` (Vercel Edge, workerd).
  `examples/next` one scenario. Docs: architecture ("File validation and safety", trust-boundary
  section), `public-api.md`, READMEs, story; `node scripts/verify-public-api.mjs --update` and review.
  Tick criteria only with evidence; run complete `pnpm verify`.

## Expected file changes

`packages/core/src/`: `types/{definition,transport,index}.ts`, `api/{validate,resource-client}.ts`,
`validation/{collect,rules,index}.ts` (new), `request/pipeline.ts`, `transfer/counting.ts`,
`transport/fetch.ts`, `errors/validation-error.ts`, `mock/files-exec.ts`, `index.ts`;
`packages/mocking/src/index.ts` (re-exports, if any); `src/index.ts`; `tests/core/{file-validation-*,
file-rules-*,response-limits,stream-limits,validation-*}.test.ts`, `tests/react/file-validation.test.tsx`,
`tests/helpers/*`; `tests/facade/*`; `scripts/verify-*.mjs`, `scripts/lib/type-consumer-fixtures.mjs`,
`scripts/spike-file-validation.mjs`; `examples/next/**`; docs and `versions/v1.4.0/*`.

## Testing strategy

- **Order of work:** characterization and compile-time tests first, then the pure validator
  (table-driven), then pipeline, streams, mocks. Fake `Transport` and in-memory streams for the primary
  suite; a loopback server only for byte-level wire facts (as in v1.3.0); no live network.
- **Layers:** pure rules → config resolution/precedence → pipeline checkpoint → stream/response
  counting → mock parity → retry/transfer/middleware interplay → types → React → packed consumers →
  runtimes.
- **Cross-cutting invariants (property-style loops over the same fixtures run live and mocked):**
  same body ⇒ same violations in live and mock; no transport call and no store write on reject;
  no rules ⇒ identical `TransportRequest`/results as v1.3.0; no error message or field ever contains
  a file name or content marker planted in the test.
- **Backward compatibility:** every v1.1.0–v1.3.0 test passes unedited; array-shorthand `fileFields`
  and `{ name }` forms asserted unchanged; the existing path-parameter `ValidationError` asserted
  unchanged.
- **Runtimes:** packed Node consumer, Next SSR (`start` + `dev`), Chromium, Vercel Edge, workerd, React
  18/19, TypeScript 5.5.4 / 5.9.3 / latest with `skipLibCheck` on/off (existing matrix).
- **Final gate:** `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck &&
pnpm test && pnpm verify:consumers && pnpm verify:browser && pnpm verify:edge` (i.e. `pnpm verify`).

## Explicit non-steps

No content sniffing or magic-byte checks, no antivirus/scanning hooks, no default limits, no new
package or dependency, no schema library, no file-middleware API or extra hooks, no per-call opt-out
unless Batch 0 proves it necessary, no change to default serialization or transfer behavior, no
advanced mock storage, no chunking/resume/parallelism, no React Hook Form, no commit, publish or
version bump as part of implementation.
