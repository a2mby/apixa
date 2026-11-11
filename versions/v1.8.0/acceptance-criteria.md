# v1.8.0 — Acceptance criteria

Gates "done" for the hardening milestone. **Nothing is checked yet**: Stage 1 only creates the
contract. A criterion is checked only with an evidence link, command result or deterministic
assertion recorded in the Evidence section below. Historical counts (v1.7.0: 1,451 tests / 138
files, 62/62 packed type consumers) are reference values; Batch 0 records the **measured** current values.

## Audit and decision gate

- [x] G1 recorded: owner approved this contract, the register and the batch order (or requested changes, applied).
- [x] Batch 0 measured and recorded the current test-file/test counts (vitest baseline on `main`: 138 files / 1,451 tests); the type-consumer count (62/62) is measured in the final `pnpm verify`.
- [x] Files not covered by the Stage 1 static audit (`request/pipeline.ts` rest, `retry.ts`, `validation/*`, `http/multipart.ts`, `packages/mocking`, React controllers) are audited and added to the register.
- [x] Every register finding is reclassified (confirmed defect / known limitation / speculative / non-issue) with a reproduction, measurement or reasoned disproof, and a severity P0–P3.
- [x] H1–H14 are locked with owner dispositions; every behavior change has a recorded G2 decision; any public change has a G3 decision.

## Lifecycle and consistency

- [x] The ownership boundary (Apixa-owned mock storage and transfer sessions versus backend/provider-owned files) is documented and no code path deletes a remote file because a frontend record changed.
- [x] Mock replace, delete, shared-reference and reset behavior is deterministic and tested: owned, pinned, unowned and dangling references; concurrent commit versus delete/reset.
- [x] Reference protection: a shared mock file is never removed while any owner or pin references it; cleanup of orphaned managed files is idempotent.
- [x] Failure atomicity: a failure injected at **every** stage of a managed mock write (stage, put, validate, commit, collect) leaves storage and records unchanged or fully committed.
- [x] Transfer sessions: fault injection at each protocol step and each persistence point never causes duplicate completion, silent data loss or a missing part that is reported as success.
- [x] Documented guarantees state what Apixa promises (per-client atomic mock commits; authoritative-reconciliation completion) and explicitly what it does not (cross-backend atomicity, remote deletion).

## Security

- [x] Redirect/credential boundary (L1) probed on real sockets; the leak is fixed per the owner-approved design (per-hop inspection, `redirectOrigins`, browsers fail closed); same-origin protections unchanged for requests that do not redirect.
- [x] Abort-versus-completion (L2) and renew/reconcile race (L3) have deterministic tests and fixes, or documented disproof.
- [x] Checkpoint trust (L4): tampered session ids and fields are rejected or safely encoded; checkpoints documented as untrusted input.
- [x] Size limits exercised against real boundaries: built-in transport (loopback socket), non-2xx bodies, streamed bodies, and a custom transport backstop; the custom-transport limitation is documented with a conformance recipe.
- [x] Presigned credential isolation re-verified on real HTTPS origins (credentials omitted, redirects rejected, redacted diagnostics); no regression in the v1.7.0 policy.
- [x] Filename and path handling: traversal, encoded separators, NUL, length and collision cases are tested for mock storage and multipart filenames.
- [x] Errors and logs: query-string credentials and sensitive headers do not appear in thrown errors or documented logging recipes (L23).

## Memory and performance

- [x] Baselines for each listed path are recorded before any change: advanced upload, multipart upload with and without `onTransfer`, streamed download, buffered download with a limit, mock storage at 5,000 files, 10,000-part checkpointing, query binary caching.
- [x] Peak retained binary memory for an advanced upload is bounded by concurrency × chunk size plus one hash chunk and **does not grow when file size doubles** (Node, instrumented and RSS-corroborated).
- [x] Per-ack checkpoint and progress cost is O(1) in part count (L10): a 10,000-part transfer's per-part cost stays within the recorded ratio of a 100-part transfer.
- [x] Multipart upload with `onTransfer` never buffers the whole body beyond the recorded cap where supported, or reports `unsupported` (L11); the choice is recorded.
- [x] Mock storage `put` and managed writes are flat in stored-file count within the recorded factor (L12).
- [x] Timing thresholds are ratios against a same-run baseline; byte thresholds are absolute; no flaky wall-clock assertions.

## Stream lifecycle

- [x] Cancellation of a stream on explicit abort, timeout after response, consumer cancel and partial consumption is tested; duplicate consumers and reader locks are characterized.
- [x] Replace, removal, GC and unmount of a cached stream are tested; library-placed unconsumed streams are cancelled where TanStack allows, else the limitation stays documented (L7) and visible.
- [x] No global stream manager and no new hook were introduced.

## Error consistency, mock/live and API

- [x] The error matrix (operation × failure stage × mock/live × hook) passes: one classification per failure kind, typed `ValidationError.violations`, no swallowed or double-reported errors, no misleading success.
- [x] Mock/live parity table is documented; intentional differences are listed; advanced transfers on mocked resources fail explicitly unless handlers are supplied.
- [x] The API/DX inventory is recorded (Evidence section); changes are documentation or internal; any public addition/removal has a G3 decision and the export snapshot diff is reviewed.
- [x] TypeScript inference is preserved (positive and `@ts-expect-error` type tests for any touched surface); the public export snapshot is unchanged unless G3 approved.

## Runtime and packed compatibility

- [x] Node 22 and 24, React 18 and 19 packed consumers, Next start and dev, Chromium, Vercel Edge and workerd pass; v1.6.0 query-identity and hydration corrections still hold.
- [x] Optional peers, framework-independent Core, one published package and no new dependency are preserved (architecture check green).

## Documentation and delivery

- [x] `docs/guides/humans/production-file-handling.md` exists and covers: upload/download, validation and limits, streaming and progress, mock storage, advanced transfers, backend requirements for resumability, presigned security, S3-compatible workflows, ownership and cleanup, runtime support, performance, common mistakes and recovery. It links to (does not duplicate) the package READMEs.
- [x] Documentation distinguishes Apixa's guarantees from backend responsibilities; planned versus implemented is honest; the F2/L7 stream limitation and custom-transport limitation remain visible if unresolved.
- [x] `docs/architecture.md`, `docs/public-api.md` (behavior notes), `docs/context.md`, `docs/roadmap.md`, `docs/story.md` and `versions/README.md` reflect reality.
- [ ] Complete `pnpm verify` passes (build, architecture, public API, typecheck, tests, packed consumers, browser, edge) and CI `verify (22)` and `verify (24)` are green on the final head; commands, measured counts and thresholds are recorded here.
- [x] `graphify update .` ran after code changes; no package-version change, publication, future version folder or edits to unrelated/untracked files.
- [ ] G4: owner final sign-off, recorded only after explicit owner confirmation.

## Evidence

Recorded 2026-11-11 on branch `task/105-file-hardening` (issue #105). The Stage 1 audit was static;
everything below is a fresh run.

### Gate results (final, second pass)

- Baseline before any change: `vitest run` on `main` (03fde16) — **138 files / 1,451 tests**.
- `pnpm verify` — **exit 0** on Node 24: build, architecture, public API (14 public entries, snapshot unchanged, 45 documented
  imports resolve), typecheck, **151 files / 1,600 tests** (+13 files, +149 tests vs `main`), packed consumers incl. React 18/19
  runtime, Next start and dev, **62/62** type-consumer checks (incl. the new `redirectOrigins` positive and negative cases),
  Chromium (**5 checks**, incl. real HTTPS presigned origins and the new redirect fail-closed scenario), Vercel Edge and workerd
  (incl. the new per-hop redirect scenario).
- Node 22: `npx --package node@22 node node_modules/vitest/vitest.mjs run` (v22.23.4) — **151 files / 1,600 tests** pass.
- CI `verify (22)` / `verify (24)`: **pending** — runs on the pull request after `/git-push`.

### Confirmed defects (failing test first, then fixed)

| ID  | Evidence before                                                                                                | Fix                                                                                                                                                                    | After                                                             |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| L2  | Server session ended `aborted` after completion was processed                                                  | `abort()` waits for completion; rejects with `ConfigError`                                                                                                             | `advanced-transfer-races` green                                   |
| L3  | "Upload is missing required part acknowledgments" with `concurrency: 2`, renew + stale inspect                 | Acks received after an inspect began survive the overwrite                                                                                                             | `advanced-transfer-races` green                                   |
| L10 | 500/1000/2000/4000 parts: 0.47/0.73/1.42/2.67 ms per part (4,000 parts = 10.7 s)                               | Sorted ledger, running size total, frozen shared manifest                                                                                                              | 0.14/0.09/0.08/0.075 ms per part; 9,000 parts 0.62 s              |
| L1  | Custom headers (`X-Api-Key`) forwarded to a cross-origin redirect target; foreign body returned (real sockets) | Per-hop inspection in the fetch transport (`transport/redirects.ts`); `SecurityError` before contact; optional `redirectOrigins` (bare GET/HEAD); browsers fail closed | `redirect-security` 37 tests; Chromium and Edge/workerd scenarios |
| V1  | `{a: shared, b: shared}` with `maxFiles: 1` accepted (shared object counted once, sent twice)                  | Ancestor-based walk counts each occurrence                                                                                                                             | `file-validation-shared-references`                               |
| M1  | `loadDataset("../outside", { basePath })` loaded a folder outside the root                                     | Resolved id must stay under the root                                                                                                                                   | `dataset-loader-paths`                                            |
| L12 | `put` 0.07 → 0.31 ms/file at 2–4k files                                                                        | In-place path scan (no per-entry allocation)                                                                                                                           | 0.013 → 0.030 ms/file                                             |

Production diff: `packages/core/src/transfer/advanced.ts`, `packages/core/src/mock/files.ts` only.

### Measurements (`node --expose-gc scripts/measure-file-memory.mjs`, Node 24, indicative)

- Advanced upload, 8 MiB parts, concurrency 2: peak external buffers **64 / 64 / 80 MiB** for 64 / 256 / 512 MiB files (flat).
- SHA-256 manifest over 256 MiB: 80 MiB external, ≈1.5 GiB/s including the (fake) upload.
- Checkpointing: 0.081 / 0.029 / 0.027 ms per part at 500 / 2,000 / 8,000 parts.
- 128 MiB upload to a draining loopback server: raw `Blob` + `onTransfer` ≈ 2 MiB resident growth; multipart `FormData` ≈ 256 MiB with **and** without progress (Node's own serialization).
- Regression thresholds (`file-memory-bounds.test.ts`): per-part cost at 4,000 parts < 2.5× that at 1,000 (was 3.6×); `put` loose budget 3 s for 3,000 files; byte caps exact.

### Security and boundary results

- **Redirects (L1), real HTTP servers, Node:** same-origin 301/302/303/307/308 followed with every header intact; relative Location;
  307 replays a replayable body; 302/POST becomes a body-less GET; loop ends with `NetworkError` after 20 hops; a streamed body is
  refused for a 307; cross-origin 301/302/303/307/308, a different host, a protocol-relative Location and a non-http(s) scheme each
  raise `SecurityError` and the destination server records **zero** requests; the error contains origins only (never the Location
  path/query or any secret); never retried. `redirectOrigins`: all five statuses followed with **no** `authorization`, `x-api-key`,
  `cookie` or body at the destination; operation setting and a narrower per-call list; 307/308 POST refused, 303 POST becomes a
  bare GET; a listed origin cannot bounce to an unlisted one; `*`, wildcards, paths, credentials, non-origins rejected at definition
  and at call time.
- **Chromium (real HTTPS origins):** a plain request works; a same-origin redirect and a cross-origin redirect (even with its origin
  listed) fail closed with `SecurityError` (opaque redirect); the destination server receives no request; no secret in the message.
- **Edge/workerd:** per-hop inspection verified with a stubbed fetch (`redirect: "manual"`, same-origin kept with its header, cross-origin
  refused without contacting the target, listed origin bare with `credentials: "omit"`). The runtimes' real network redirect behavior is
  not exercised there (no sockets); Node and Chromium cover real redirects.
- Checkpoint/session id: 6 malformed-structure cases rejected before any request; encode-on-use recipe verified (L4; docs only, per owner).
- Mock paths: 6 hostile legacy names, 6 explicit-name and 4 directory cases, disk isolation (L20). Query-string secrets absent from enumerable
  error output (L23). Custom-transport limit backstop and opt-in default (L5/L13). Dataset ids confined to the root (M1).
- Validation counts shared references per occurrence (V1). Presigned credential isolation unchanged and still passing (Chromium HTTPS run).

### API/DX inventory (documentation outcome; no API change)

Undocumented-by-default values now stated in the guide: no response cap unless `maxResponseSize`; chunk 8 MiB, concurrency 1,
10,000 parts, 4 MiB control-response cap and 4 MiB checkpoint cap; precedence call > operation > resource;
size options are named by scope (`maxSize` per field, `maxTotalSize`/`maxBodySize` per body, `maxResponseSize` per response).
No renaming proposed; no weak inference found in the touched surface.

### Managed mock-write fault injection

`tests/core/mock-write-faults.test.ts` (15 tests): failure before any file exists, after allocation and before references persist, abort
after the handler finished, reset between allocation and commit, file-read failure, id collision, failed and aborted replacement
(then a successful retry), array replacement, shared-file deletion, failed/repeated delete, manual files, concurrent writes with one failure,
interleaved shared replacements and recovery; reference integrity asserted after each. No defect found; guarantees documented.

### Remaining source audit (second pass)

`request/pipeline.ts`, `request/retry.ts`, `validation/*`, `http/multipart.ts`, `packages/mocking` and the React controllers were read; results
and the two defects found (V1, M1) plus one limitation (R1: mutation variables stay in TanStack's mutation cache for `gcTime`; recipes tested in
`file-mutation-retention`) are in `implementation-plan.md`.

### Performance and memory (re-measured after the redirect change; Node 24, indicative)

Advanced upload external buffers 80 MiB at 64/256 MiB and flat at 512 MiB; checkpointing 0.057 / 0.029 / 0.028 ms per part at 500 / 2,000 / 8,000 parts;
mock `put` 0.014 / 0.016 / 0.030 ms per file; raw `Blob` + progress ≈ 0 MiB growth, multipart `FormData` ≈ 256–260 MiB for 128 MiB. No regression versus the first pass.

### Owner decisions

Resolved: L1/H3 secure redirects (implemented), L14/H10 guidance only, L4 documentation only. H1–H14 locked. No unresolved P0/P1.

### Remaining unchecked

CI `verify (22)` / `verify (24)` on the pull request, and G4 owner final sign-off.
