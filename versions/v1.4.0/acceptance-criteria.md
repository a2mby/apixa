# v1.4.0 — Acceptance criteria

Tick an item only with verified evidence (test name, command output or script result).

## Design and audit

- [x] Batch 0 characterization tests exist and pass on unmodified behavior (no limits, ordering, `ValidationError` shape, stream counting only with `onTransfer`, mock write stores any file)
- [x] Spike results (error surfaced when a request stream errors, `File` metadata edge cases) are recorded in `implementation-plan.md` and V1–V17 are locked there
- [x] No v1.1.0–v1.3.0 test was edited to make this milestone pass, other than two examples that used the now-valid option name `maxSize` as an "unknown option" (changed to `bogus`)

## Configuration and precedence

- [x] File rules (size, count, MIME, extension, filename) are declared on `FileFieldOptions`; the array shorthand and `{ name }` forms keep working with unchanged typing and entity checks
- [x] Request-level limits (`maxTotalSize`, `maxFiles`, `maxBodySize`) resolve resource → operation key-wise; field rules resolve resource → operation key-wise; a defined operation value (including `0` and `false`) wins (table-driven precedence tests)
- [x] Invalid rules (non-integer/negative/NaN sizes, `min > max`, malformed `accept`, unknown keys, a field not in `fileFields`) are `ConfigError` at `defineApi`, naming the path
- [x] With no rules configured nothing is walked or wrapped: the `TransportRequest` seen by a custom transport equals v1.3.0's and results/errors are identical
- [x] No rule is on by default; no default limit exists

## Runtime validation (requests)

- [x] Size: `maxSize`, `minSize`, zero-byte files, exact-limit boundary and over-by-one for single files; `maxTotalSize` across files
- [x] Count: per-field `min`/`max` for single and array fields, request-level `maxFiles`, empty array, missing optional field
- [x] MIME: exact, wildcard (`image/*`), case and parameter normalization, `reject` beats `accept`, empty/unknown type policy; documented as caller-declared
- [x] Extension: `.ext` rules, case normalization, no-extension policy, multiple dots, dotfiles, unicode names; `filename: "strict"` flags separators, control chars, NUL, overlong and double extensions
- [x] Bodies that are not files are handled explicitly: JSON/strings ignored, nested objects and arrays walked (bounded depth, cycles safe), caller `FormData` entries validated, raw `Blob`/buffer under `maxBodySize`, streams counted only, and field rules are documented as not applying to raw bodies, which are governed by `maxBodySize` / `maxTotalSize` only
- [x] Validation covers builtin operations, custom declarative operations, function operations and `ctx.request()`
- [x] Validation reads metadata only (`size`, `type`, `name`) and never file bytes (test with a `Blob` whose readers throw)

## Error behavior

- [x] Violations throw the existing `ValidationError` (`code: "VALIDATION"`, `retryable: false`, same class and name) with typed `violations` (`code`, `path`, `limit?`, `actual?`)
- [x] All violations of a request are reported in one error (bounded at 20); a mid-stream violation reports the first
- [x] No error message, `violations` entry or serialized error contains a file name or file content (marker test); the path-parameter `ValidationError` behavior is unchanged
- [x] Error middleware receives the `ValidationError`, can recover or replay, and `replay()` re-validates

## Pipeline, middleware and transfer integration

- [x] Validation runs once per logical call, after request middleware and key transforms and before serialization, transport and mock execution; files added by request middleware are validated
- [x] A pre-send violation makes no transport call, emits no `onTransfer` event and is never retried; valid calls are unaffected by retries
- [x] No new middleware hooks or file-specific pipeline exist; request/response/error middleware run once per logical call as before
- [x] Abort/timeout precedence is unchanged (an already-aborted signal rejects with `AbortError`, not `ValidationError`)
- [x] A mid-transfer limit ends the transfer as an `error` event (`willRetry: false`) with `ApiError.transfer` set, and never as a completed transfer

## Streaming and response safety

- [x] A `ReadableStream` request body with `maxBodySize`/`maxTotalSize` is limited by a pull-based counting wrapper with no buffering and no read-ahead (test with a source larger than a fixed buffer budget); exceeding it surfaces `ValidationError`, not `NetworkError`
- [x] The wrapper is applied for a limit without `onTransfer`, and v1.3.0 observation behavior is unchanged
- [x] `maxResponseSize` is enforced for blob, arrayBuffer, text, json and stream results: byte-exact under the limit, rejects over by one byte, early reject from a trustworthy `Content-Length` (body cancelled), authoritative counting when length is absent, wrong or compressed
- [x] A limited `stream` result errors the consumer's stream when exceeded, keeps backpressure and bytes/order below the limit, and releases the call's signal, timer and body
- [x] Response `accept` checks `Content-Type` and is documented as server-declared
- [x] Documentation states that bytes up to the limit may already have been sent or received when a stream is cut off

## Mock and live consistency

- [x] The same validator runs before mock execution: identical bodies produce identical violations live and mocked (shared table-driven fixtures)
- [x] A rejected mocked write leaves `mockFiles()` and records untouched; accepted writes behave exactly as before; reset/isolation unchanged
- [x] Mocked downloads respect `maxResponseSize` using the exact byte size; mocked `stream` stays `MOCK_UNSUPPORTED`

## Types

- [x] Rule fields are typed on `FileFieldOptions`/operation configuration; `fileFields` entity checks and read types (`string`/`string[]`) are unchanged
- [x] `ValidationError.violations` and `FileViolation` codes are typed and narrowable; compile-time tests cover builtins, custom operations, `ctx.request()`, `useResource`, `useResourceQuery`, `useResourceMutation` with no `any`/`@ts-ignore` and `IsAny` checks on hook results
- [x] Rule configuration does not enter query keys or cache identity (test)
- [x] Types hold in packed npm declarations across the consumer matrix (React 18/19, TS 5.5.4/5.9.3/latest, bundler/nodenext, `skipLibCheck` on/off)

## Runtimes and compatibility

- [x] Node: validation, stream limit and response limit verified through the packed consumer over a loopback server
- [x] Chromium: an oversized/disallowed file is rejected with no request reaching the server; a stream limit and a response limit behave as documented
- [x] Vercel Edge Runtime and workerd verified; Next.js SSR (`next start` and `next dev`) consumer still builds and renders with rules configured
- [ ] React 18 and 19: a hook mutation rejected by a rule surfaces the typed `ValidationError`; rules and `onTransfer` coexist _(hook runtime tests run on the workspace React 19 only; packed React 18/19 consumers verify types, build and SSR)_
- [x] Core still has no framework or `node:*` imports; `pnpm check:architecture` passes; no new package or dependency

## Backward compatibility

- [x] All v1.1.0–v1.3.0 tests pass unedited; array-shorthand and `{ name }` `fileFields`, JSON behavior, serialization, transfer events and retry policy are unchanged
- [x] Public API changes are additions only, recorded in `docs/public-api.md`; snapshot reviewed after `node scripts/verify-public-api.mjs --update`

## Docs and example

- [x] `docs/architecture.md` (validation and safety section), `docs/public-api.md`, README and Core README document rules, precedence, errors and limits, marking implemented vs planned
- [x] A **trust boundary** section states: client validation is developer experience, the backend must re-validate; `File.type` and `File.name` are caller-controlled; extensions do not prove content; no sniffing; mid-stream limits are best effort
- [ ] `examples/next` shows one validation scenario (rejected file, no request); no other example touched _(scenario added and type-checked; not driven in a browser: the directory is untracked here)_
- [x] `docs/story.md`, `docs/roadmap.md`, `docs/context.md` and `versions/README.md` reflect the implemented state

## Verification gate

- [x] `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck && pnpm test` pass
- [x] `pnpm verify:consumers`, `pnpm verify:browser`, `pnpm verify:edge` pass
- [x] Complete `pnpm verify` passes

## Evidence

- **Characterization/audit:** `tests/core/file-validation-characterization.test.ts`; `scripts/spike-file-validation.mjs`; spike results and V1–V17 in `implementation-plan.md`.
- **Rules and config:** `file-rules-size|count|mime|extension.test.ts`, `file-validation-config.test.ts` (precedence, `ConfigError` table, zero-cost default), each live and mocked via `tests/helpers/validation.ts`.
- **Pipeline, mock, errors, transfer:** `file-validation-pipeline.test.ts` (no transport call/event/retry, middleware order, `replay()`, `ctx.request()`, abort precedence), `file-validation-mock.test.ts` (live/mock parity, atomic rejected writes, reset/isolation, exact mock response sizes), `validation-errors.test.ts` (class/code, cap 20, marker secrecy), `validation-transfer.test.ts`.
- **Streams/responses:** `stream-limits.test.ts` (incl. 48 MiB source cut at the limit over a loopback socket, `NetworkError` not surfaced, never retried), `response-limits.test.ts` (json/text/blob/arrayBuffer/stream, exact boundary, known/lying/compressed lengths, early reject cancels the body, backpressure, custom transports).
- **Types/React:** `file-validation-types.test.ts`, `tests/react/file-validation.test.tsx` (hook rejection, query keys, `IsAny`); packed declarations 62/62 (`scripts/verify-type-consumers.mjs`).
- **Runtimes:** Node packed consumer + Next SSR (`verify-unified-consumer.mjs`), Chromium (`verify-browser.mjs`: rejected file never reached the server; response and stream limits), Vercel Edge and workerd (`verify-edge.mjs`).
- **Gate:** `pnpm verify` result recorded in the story entry.

## Sign-off

- [ ] Owner sign-off
