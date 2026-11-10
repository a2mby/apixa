# v1.7.0 — Acceptance criteria

Implementation gates with evidence recorded below. Each checked item requires an evidence link,
command result or deterministic assertion before it is checked. Optional extensions require the
explicit D14/D18 owner decision and corresponding criteria, not an implicit claim of completion.

## Audit and decision gate

- [x] Baseline audit covers v1.1.0–v1.6.0, existing public contracts, stream limits, retries,
      middleware, validation, mocks, hooks and runtime evidence; gaps reproduced or disproved in Batch 0.
- [x] D1–D18 have recorded owner dispositions with exact approved configuration, types, state
      transitions, public additions and deferrals before production edits. Public-contract conflicts
      (mixed-kind requests, progress, controls/native Promise, origins and transport security) are resolved explicitly.
- [x] Two deterministic backend protocols (offset/range and S3-style part manifest) prove the common
      seam; protocol limits and signing/checksum/CORS requirements cite chosen primary specifications.
- [x] `ctx.request` option forwarding, including `maxResponseSize`, is characterized; any proven
      integration fix has a failing regression first and recorded compatibility impact.

## API, inference and compatibility

- [x] No strategy configured: existing JSON, automatic binary multipart, downloads, headers,
      error texts, retry defaults and progress event sequences match the baseline without new options.
- [x] Advanced strategy is explicit; no file-size threshold changes an ordinary request. Invalid
      strategy/dataFormat combinations and invalid source selectors fail before network work.
- [x] Direct and curried `defineApi`, create/update/patch/upsert overrides, a declared custom
      operation and approved function/context composition infer original arguments and domain results.
- [x] Every operation still returns native `Promise<T>`; no thenable wrapper. `full: true` exposes
      actual approved final-response metadata, not invented session HTTP status/headers.
- [x] Positive and `@ts-expect-error` tests cover checkpoint/version/protocol types, source selection,
      part/session results, controls, optional capabilities and rejection of invalid configurations.
- [x] Custom operations still beat conventions; disabled operations remain disabled; step binding
      respects existing read/write classification. No guessed assembly/status endpoints.

## Chunk boundaries and bounded resources

- [x] Exact byte comparison for file sizes 0, 1, S−1, S, S+1, 2S and 2S+1 (S = configured size),
      plus a non-power-of-two size; no gaps, overlaps, empty trailing part or duplicated bytes.
      Zero-byte behavior is explicit and tested per protocol.
- [x] Reject zero/negative/fractional/nonfinite/unsafe chunk size, concurrency and offsets, excessive
      part counts and incompatible protocol min/max limits before session creation; valid custom sizes work.
- [x] Instrumented large seekable source proves lazy slicing: at most C active part reads plus one
      hash buffer, no full-source `arrayBuffer()`/`text()` call and no eager N-part Promise queue.
- [x] Doubling simulated file size at fixed S/C does not increase retained binary buffers; only
      explicitly capped O(N) acknowledgment/checkpoint metadata may grow. Record configured caps and
      any transport-serialization overhead; a measured Node slow-socket test corroborates bounded read-ahead.
- [x] Slow transport/sink demonstrates backpressure, at most C active requests, no reads after
      cancellation, eventual buffer release and no leftover listeners/timers after terminal settlement.
- [x] Sequential result and bytes equal supported parallel result; unsupported parallel protocol
      falls back sequentially as documented, never sends overlapping parts.

## Sessions, checkpoints and recovery

- [x] Initiate/part/status/complete/abort/renew all use injected Transport through the existing Core
      pipeline, including middleware/errors/limits; tests detect any direct fetch or transport bypass.
- [x] Session completes exactly once only after all required authoritative part acknowledgments and
      integrity checks; part body consumption/HTTP 2xx alone cannot resolve successful completion.
- [x] Interrupted session resumes from server-confirmed parts without resending them; test both
      response-lost-after-commit and checkpoint-save-lost-after-ack cases with independent server state.
- [x] Restart test discards the original client/orchestrator, JSON round-trips metadata, reacquires
      source bytes, creates a new client and reconciles the same server session before resuming.
- [x] Unknown/expired/remote-aborted session, corrupt/unsupported checkpoint version, mismatched
      protocol/operation/source/layout, duplicate/out-of-bounds ranges, excess metadata and conflicting
      part checksum all fail safely; no silent restart or skip based only on local flags.
- [x] Reconciliation handles server-only confirmed parts and locally confirmed/server-missing parts;
      no unsafe resend on ambiguous state. Required inspect capability absent means no resume promise.
- [x] Persistence receives immutable ordered snapshots, no source binaries/headers/secrets/signed
      URLs; slow saves backpressure and rejected saves stop further scheduling with a clear durability failure.
- [x] Concurrent/stale saves cannot overwrite a later checkpoint within one transfer. Cross-tab/process
      coordination is explicitly caller-owned; no concurrency safety claim across independent clients.
- [x] Duplicate completion, lost finalize response and resume of an already completed session are
      reconciled without creating a second object or claiming success without authoritative evidence.

## Retry, failure recovery and controls

- [x] Failed parts alone retry when protocol idempotency and existing request policy allow; successful
      parts remain confirmed. Retry count, Retry-After/backoff, shouldRetry/onRetry and attempt semantics
      retain existing behavior; default write retry policy is unchanged.
- [x] Stable session/part identities survive request retry, approved middleware replay and restart;
      distinct parts do not share idempotency keys. Ambiguous non-idempotent writes reconcile or fail.
- [x] Deterministic request-count assertions prove no multiplied retries from scheduler, renewal,
      middleware or TanStack; renewal attempts are bounded and do not replay acknowledged parts.
- [x] Partial failure stops queued work, settles/drains or cancels active requests, retains safe
      acknowledged state, and rejects once with existing error classification plus approved metadata.
- [x] Overall timeout covers protocol steps, hashing, persistence, retries/backoff and paused time;
      it rejects `TimeoutError`. Aborted signal rejects `AbortError`; neither is mislabeled or retried.
- [x] Pause starts no new parts, quiesces active parts and saves state; resume within the call uses
      it safely. Caller cancellation does not automatically delete the server session.
- [x] Explicit remote abort invokes the configured backend step and reports success only after
      acknowledgment; abort failure/expired session is reported truthfully. Late part responses cannot revive it.
- [x] Race tests cover pause/cancel/failure/timeout versus part acknowledgment, reconciliation and
      finalization; at most one logical terminal result, no late state mutations or unhandled rejection.

## Progress and integrity

- [x] Existing `onTransfer` remains per request direction/attempt, with the same unsupported and
      retry-reset semantics. Observed bytes never become fabricated server acknowledgment.
- [x] Aggregate confirmed bytes equal the union of acknowledged source ranges, bounded by source
      size; retries/out-of-order/duplicate callbacks add no duplicate bytes. Reconciliation corrections
      identify their phase; completion is reported only after authoritative finalization.
- [x] Per-part identity and attempt are observable through the approved session seam. Unsupported
      byte observation leaves in-flight counts absent; no estimated/fake percentage or mandatory pacing.
- [x] Observer sync throws/async rejection cannot break a transfer; checkpoint persistence failure
      remains distinct. Ordinary transfers emit no new session observations.
- [x] Chunk hash vectors match known SHA-256 values using bounded reads; protocol encodings/headers
      match expected values, and altered chunk bytes/checksums fail before successful finalization.
- [x] Changed same-size source and stale source metadata cannot bypass strong resume checks;
      metadata-only matching is documented as insufficient for a strong identity claim.
- [x] Local digest, backend-returned checksum and server-verified integrity have distinct typed
      states. Wrong final size/manifest/checksum or incomplete assembly never yields verified success.
- [x] No whole-file ArrayBuffer for hashing, hash-of-hashes equivalence or ETag-as-MD5 assumption.
      Required unavailable crypto/whole-file verification fails explicitly; optional unavailable
      verification is reported accurately and tested with crypto feature detection disabled.

## Presigned and S3-compatible security

- [x] Ordinary cross-origin operation/middleware URLs remain rejected by the existing guard.
      Delegated origins require explicit approved policy for each request/renewal after middleware.
- [x] Reject unapproved/malformed/scheme-relative destinations, non-HTTPS production destinations,
      URL userinfo and disallowed signed headers before send; tests cover middleware destination rewrites.
- [x] No inherited Authorization/Cookie/API-key header, credential provider or credential mode
      reaches a delegated destination; only approved signed headers are sent. Custom transports that
      cannot enforce credential/redirect policy reject delegated mode before sending.
- [x] Redirect tests prove delegated requests cannot redirect to approved or unapproved hosts and
      leak headers/credentials. Chromium tests verify actual credential omission and CORS behavior,
      not only fake request fields; Node tests exercise real redirect responses.
- [x] Exact signed URL/query encoding and signed headers survive unchanged; no baseURL prefix,
      query serializer/key transform or multipart boundary corrupts a raw presigned part request.
- [x] Expired URL renewal occurs only through configured trusted backend operations, is bounded,
      respects deadline/cancel and reconciles ambiguous part outcomes. Checkpoints never retain URLs.
- [x] Signed query tokens/auth are absent from library-generated error messages/metadata, replay
      state, progress and persistence; trusted user middleware exposure is explicitly documented.
- [x] Tested SDK-free S3-compatible recipe covers initiate, limits/part numbering, presigned part
      requests, exposed opaque ETags, inspect/list, ordered completion, abort, recovery and renewal.
      Missing ETag, checksum failure and selected-protocol completion error payload reject truthfully.
- [x] HTTP multipart form serialization and S3 multipart sessions are tested/documented separately;
      no AWS SDK, client signing secrets or mandatory provider dependency enters the package.
- [x] If a public adapter is approved (D14), its concrete missing capability, supported provider
      contract and extra conformance tests are recorded. Otherwise delivery is the tested recipe,
      with no universal provider compatibility claim.

## Validation, middleware, mocks and large downloads

- [x] Original source/body metadata validates after applicable middleware and before initiate;
      rejected whole-file size/count/type/name yields no session/network/mock mutation. Chunking
      cannot bypass whole-file limits. Step bodies and responses also retain applicable bounds.
- [x] Request/response/error middleware order and replay/recovery semantics are characterized for
      outer operation and each step; no duplicate outer send, hidden unsafe retry or corrupted bytes.
- [x] Protocol failures preserve useful HttpError/NetworkError/ValidationError/TimeoutError/
      AbortError classification and safe structured context; no unreviewed error text/class changes.
- [x] Mock resources use explicit handlers or reject unsupported advanced protocols without reaching
      network. Existing fixtures, disks, ownership, reset and atomic file/record behavior remain intact;
      fake transports simulate sessions without a second production mock storage engine.
- [x] Existing streamed downloads to a slow sink preserve bytes, bounded read-ahead, trustworthy or
      absent totals, cancellation and maxResponseSize with and without onTransfer; binary buffered
      response modes retain their documented memory behavior.
- [x] Presigned download GET uses the same approved security policy and preserves bytes/limits/
      cancellation. No range-download implementation unless D18 addendum is owner-approved; if
      approved, it must gate 206/Content-Range/If-Range, changed validator, ignored Range (200), 416,
      encoding, sink-offset/ownership and interruption tests before claiming resumability.

## React, runtime and packed consumers

- [x] Advanced mutation works through `useResourceMutation` and `useResource`; existing query reads
      through `useResourceQuery` still work. Cancellation, final invalidation, typed results/errors,
      retry policy and caller signals are tested on React 18 and React 19 against the packed package.
- [x] Session callbacks/controls remain outside automatic query identities; binary identity guard,
      binary/stream dehydration exclusions, SSR behavior and consumer-owned streams remain intact.
- [x] Tracked `examples/query-ssr-next` shows explicit advanced upload, interruption/reconciliation/
      resume, progress and cancellation through public imports; Chromium drives it in dev and production.
- [x] Node 22 and 24 run deterministic protocol and real loopback/backpressure/security checks.
      Chromium proves browser behavior; Next SSR has no browser-global access at module evaluation
      and serializes no source bytes, signed URLs or active control state.
- [x] Small equivalent advanced protocol scenarios execute against packed facade in Vercel Edge
      and workerd without nodejs_compat; capability gaps (crypto, header visibility, redirects) reject
      explicitly or report optional unsupported state, never claim unexecuted upload progress.
- [x] Packed TypeScript consumer matrix (existing minimum/current/latest, bundler/nodenext,
      skipLibCheck on/off, optional/missing peers) verifies new types and existing inference without
      private specifiers, `any` leakage or mandatory React/cloud dependencies.

## Constraints, docs, final gate and sign-off

- [x] Only `apixa` is public; Core imports no React/TanStack/RHF/Mocking. No new package, separate
      transfer client, mandatory dependency, unrelated example edit or automatic ordinary-upload behavior change.
- [x] Approved exports/behavior changes are recorded in public-api/story; generated export snapshot
      is updated through its script only when needed and reviewed; existing declarations stay compatible.
- [x] README/Core/React docs and architecture describe implemented protocols, controls, persistence,
      security, integrity strength, resource caps and runtime limits. Planned/deferred work stays labeled.
- [x] `graphify update .` runs after implementation code changes; existing suites remain intact
      except explicitly justified regression corrections.
- [ ] Final `pnpm verify` passes in full; CI Node 22 and 24 is green. Record commands, counts,
      runtime/protocol evidence and any explicit owner-approved deferrals here, without conflating
      static audit or historical verification with a fresh run.
- [ ] Implementation-plan batches complete, completion story/pointers reflect reality, and owner
      signs off the remaining limitations and v1.7.0. No incidental version bump or publication.

## Implementation evidence — 2026-11-10

D1–D18 and the precise proposal were approved as written by the owner before production work.
The single `/implement-version` invocation delivered the ordered batches under issue #103.

| Acceptance area                             | Concrete evidence                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline and compatibility                  | `tests/core/advanced-transfer-baseline.test.ts`; existing ordinary upload/download suites retained; `ctx.request.maxResponseSize` regression reproduced before correction.                                                                                                                              |
| Configuration and inference                 | `advanced-transfer-types.test.ts`, `advanced-transfer-integration.test.ts`, packed TypeScript matrix; specialized `apixa/core` exports only, curated root unchanged.                                                                                                                                    |
| Slicing, concurrency and memory             | `advanced-transfer-chunks.test.ts`: boundary bytes, lazy slices, bounded workers/buffers, doubled source size and real slow-socket backpressure. Defaults: 8 MiB, concurrency 1, maximum 10,000 parts.                                                                                                  |
| Sessions and restart recovery               | `advanced-transfer-recovery.test.ts`, `advanced-transfer-checkpoints.test.ts`: independent server ledger, lost acknowledgment/persistence, JSON restart, authoritative inspect and invalid/expired checkpoints. Serialized checkpoint cap: 4 MiB.                                                       |
| Integrity                                   | `advanced-transfer-integrity.test.ts`: SHA-256 vectors, changed source, bounded digest buffer, local versus server evidence and unsupported crypto.                                                                                                                                                     |
| Retry, controls and progress                | `advanced-transfer-reliability.test.ts`, `advanced-transfer-control.test.ts`, `advanced-transfer-progress.test.ts`: stable part keys, safe replay, caller options, shared deadlines, pause/resume/cancel/abort, confirmed totals and per-attempt observations.                                          |
| Presigned and S3                            | `advanced-transfer-presigned.test.ts`, `advanced-transfer-s3.test.ts`; real HTTPS Chromium origins prove credential omission with positive cookie control, CORS ETags and redirect rejection. SDK-free tracked S3 recipe covers ordered ETags, recovery, renewal, abort and embedded completion errors. |
| Middleware, validation, mocks and downloads | `advanced-transfer-integration.test.ts` plus existing file/stream/mock suites: whole-source validation before initiation, binary protection, explicit mock rejection/handlers, existing streamed sinks and secure presigned GET.                                                                        |
| React and runtimes                          | `tests/react/framework-files-advanced.test.tsx`; packed React 18/19 hooks; shared `scripts/lib/advanced-transfer-scenario.mjs` in Node, Chromium, Next SSR, Vercel Edge and workerd. Tracked Next demo exercises interruption and resume.                                                               |
| Architecture and documentation              | Core remains framework independent; one published package; generated export snapshot reviewed with no removals; Core/React READMEs, architecture, public API, tracked example and story updated.                                                                                                        |

Supported limits: resumability requires backend inspection and strong source identity; checkpoints
belong to the caller and contain no source bytes or signing credentials. Live-stream completion of
an advanced upload is unsupported; existing streamed downloads remain available. S3 delivery is a
concrete backend-mediated recipe, with no general provider framework, mandatory SDK or range
resumable downloader. These are the approved D14/D18 boundaries.

Remote CI has not run because commit/push is outside the authorized stage. Final milestone owner
sign-off remains open; prior API approval is recorded separately. The two combined final checklist
items remain unchecked for those reasons, even after local verification passes.

### Final local verification

- `pnpm verify` — **exit 0** on Node 24.20.0: build, architecture, API compatibility,
  typecheck, **1,451 tests / 138 files**, packed consumers, **62/62** type-consumer checks,
  packed React 18/19, Chromium dev/production and real HTTPS security (**5 checks**),
  Vercel Edge Runtime and workerd without `nodejs_compat`.
- `npx --yes --package node@22 node node_modules/vitest/vitest.mjs run` — **exit 0**,
  **1,451 tests / 138 files** on Node 22. The milestone adds **115 tests** over the 1,336-test baseline.
- `pnpm exec tsc --noEmit -p tests/tsconfig.json` — **exit 0** after final caller-option fixes.
- `graphify update .` — **exit 0** after final production changes; 3,795 nodes / 8,342 edges.
- `git diff --check` and local Markdown file-link validation — passed. Package manifest and lockfile
  unchanged; unrelated local files preserved; no future version folder created.

Local command logs: `/tmp/apixa-v170-done-verify.log`, `/tmp/apixa-v170-done-node22.log`,
`/tmp/apixa-v170-done-graphify.log`. These are local evidence, not remote CI results.
