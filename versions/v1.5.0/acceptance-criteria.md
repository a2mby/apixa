# v1.5.0 — Acceptance criteria

Implementation gates below are backed by the recorded evidence. Owner sign-off was provided on 2026-11-09 during `/git-push`.
The Stage 1 baseline is historical; final implementation evidence is listed separately below.

## Audit and decision gate

- [x] Batch 0 characterizes current storage, source loading, callbacks, reset and commit behavior; S1–S12 have final recorded decisions.
- [x] Token syntax/escaping, strict seed resolution, shared ownership and handler transaction compatibility are explicitly settled before production edits. No atomicity exception is silently waived.
- [x] Public additions and any semantic changes are listed with compatibility evidence; UUID reference formats remain unchanged.

## Default API and types

- [x] Existing no-argument construction, `put(blob, { resource, field })`, `mockFiles(client/resource)`, has/meta/get/list/delete/clear/size and `resetMock` signatures and results pass characterization.
- [x] No-config uploads produce existing UUID refs with original encoded name suffix; bare IDs and legacy suffixes still resolve; `isMockFileRef` stays syntactic and has no existence side effect.
- [x] Reads keep entity `string`/`string[]` references; eligible writes retain File/Blob inputs and native Promise results. JSON and custom operation inference remain compatible.
- [x] Positive/negative TS tests cover config, fixtures, metadata, filters, callback results and handler file reads without `any` leakage; wrong types/unknown options reject.
- [x] Packed npm consumers across the existing TS/module-resolution/React peer matrix pass, with no private specifiers leaked and no removed public symbols.

## Disks, paths, names and metadata

- [x] Omitted disk uses the same per-client default; two disks can hold the same virtual path without collision, and two clients never share state even with deterministic identical IDs.
- [x] Metadata exposes normalized disk/path and justified original/stored names while retaining id/ref/type/size/lastModified/createdAt/resource/field; snapshots are immutable and sizes match stored bytes.
- [x] Table tests cover slash/backslash normalization, repeated separators, dot segments, empty root, Unicode/case preservation and prefix segment boundaries.
- [x] Absolute/drive/UNC paths, traversal, encoded traversal/separators, NUL/control characters, schemes, invalid disks and unsafe callback output reject with existing error classes before mutation.
- [x] Unusual legacy display names still upload; derived default virtual paths remain safe and cannot escape a disk.
- [x] Original, unique and deterministic naming work; ID callbacks yield valid UUIDs; duplicate IDs or exact disk/path collisions never overwrite existing bytes or records.
- [x] `list` combines resource/field/disk/path-prefix filters, returns stable insertion order and metadata only, and neither loads fixtures nor reads/copies file bytes.

## Fixtures and datasets

- [x] Text, Uint8Array, Blob, zero-byte and lazy factory fixtures work with explicit MIME/name/timestamps; a runtime without File works through Blob and explicit metadata.
- [x] Inline, provider and named datasets can reference registered fixtures in scalar/array declared file fields; only selected seed records' fixtures load, in bounded serial work with single-flight initialization.
- [x] Exposed records contain ordinary refs, never descriptors, Blob/bytes or fixture tokens; ordinary non-file strings and existing dataset APIs remain unchanged.
- [x] Repeated fixture key use shares only the intended resource fixture instance; clients/resources using the same registry definition have independent ownership and storage.
- [x] Unknown fixture key, factory rejection, unreadable bytes, invalid metadata and configured validation failure publish no partial seeded records or files; a later initialization retry succeeds.
- [x] Existing local stored refs resolve bytes/metadata without fetching. Opt-in fixture resolution rejects foreign/stale refs with documented errors; legacy unconfigured seed strings remain compatible.
- [x] Fixture materialization applies existing applicable file rules without a second validator or validation bypass; setup alone emits no transfer events.
- [x] Cached bundled dataset modules and caller records/bytes are never mutated; dataset records/snapshots do not embed large binary values.

## Lifecycle, ownership and isolation

- [x] Create/createMany/update/patch/upsert and delete/deleteMany preserve expected record semantics, file array order and automatic file lifecycle.
- [x] Replacement/dropped fields release old managed ownership; a ref used by another record/resource or pinned by the fixture baseline remains retrievable until its final managed owner is released.
- [x] `resetMock(resource)` restores that resource's fixture baseline and removes its transient files without deleting another resource's active refs; client reset covers all mocked resources.
- [x] Reset remains synchronous, invalidates pending generations immediately and rehydrates fixture bytes consistently on the next awaited operation; direct-read behavior in between is documented and tested.
- [x] Explicit delete returns true/false as before; missing low-level get/meta return undefined, has returns false and handler reads throw `MOCK_NOT_FOUND`. Explicit clear/delete may leave stale record refs and never silently rewrite records.
- [x] After explicit clear/delete, fixture reset repairs the baseline; repeated setup/write/reset cycles return live counts and retained bytes to the documented baseline with no object URLs or global byte cache.
- [x] Manual `put` ownership and resource/client cleanup are documented and tested; shared client inspection via `mockFiles(resource)` stays compatible.

## Atomicity and concurrency

- [x] Staged bytes and record refs are invisible until a single managed commit. A failed body read, naming callback, clone, validation, reference resolution, duplicate/generated ID or path collision leaves records/files/ownership unchanged.
- [x] Bulk failure after an earlier valid item commits no rows/files, including mixed explicit/generated IDs and failures late in a multi-file batch.
- [x] Abort/timeout before commit and reset during provider load, fixture read or upload staging publish nothing; late completions cannot resurrect files or records.
- [x] Concurrent same-resource writes cannot lose updates or remove a newly retained ref; different resources stay independent and conflicting shared disk/path commits have one consistent outcome.
- [x] Approved managed-handler semantics cover read-your-writes, throw after mutation, abort/timeout and late continuation; no file/record partial state remains. Legacy callback boundaries have explicit evidence and approval where behavior differs.
- [x] Configured mock response validation and result preparation respect the recorded commit boundary. Post-commit response middleware failure is documented separately; it does not falsely promise rollback of arbitrary user side effects.
- [x] No mutation is advertised as complete by transfer events before a managed rollback; error middleware/replay uses the existing lifecycle and revalidates.

## Integration and runtime compatibility

- [x] Upload → stored ref → handler download returns identical bytes and correct MIME/filename/length metadata for blob/arrayBuffer/text; custom mock operations never reach a throwing transport.
- [x] v1.4.0 validation rejects before storage mutation/network/event emission; response limits and safe typed ValidationError details remain intact.
- [x] Mock uploads remain observation-unsupported; sized mock downloads retain real start/progress/complete events and exact totals; JSON remains honest about unknown size. Mock stream responses stay `MOCK_UNSUPPORTED`.
- [x] Existing middleware order, cancellation, timeout, retry, transforms, custom endpoints and function `ctx.request()` behavior pass regression tests without weakened assertions.
- [x] `defineApi`, `defineApis` and `defineMockApi` share the same storage semantics with independent client/backend state.
- [x] Node, Chromium, Next SSR (dev and production), Vercel Edge and workerd exercise fixture seed → upload/replace → download → reset using the packed package. Core/Mocking imports require no node filesystem, React or provider dependency.

## Documentation, verification and sign-off

- [x] Architecture/public API and READMEs document only implemented syntax, costs, path/ref rules, ownership, direct destructive tools, reset visibility and the atomic commit boundary.
- [x] Any Next scenario is delivered as intended source with runtime evidence; ignored local files are not claimed as committed evidence. No other example is changed.
- [x] `pnpm verify` passes; public export snapshot regenerated/reviewed when needed; `graphify update .` run after code changes; exact evidence recorded here and in story.
- [x] No new public package, mandatory dependency, storage driver API or excluded file/network feature; no version bump/publication performed as part of implementation.
- [x] Previous v1.1.0–v1.4.0 owner sign-offs, React 18 runtime gap and prior Next validation evidence remain accurately tracked, with no automatic waiver from this milestone.
- [x] All implementation batches complete; deviations and decision rationale recorded in the implementation plan.
- [x] Owner sign-off for v1.5.0 — explicitly approved by the owner on 2026-11-09.

## Stage 1 baseline evidence (2026-11-09)

Contract formatting, relative links, four-file structure and active milestone pointers checked;
`git diff --check` passes. `pnpm verify` passes (exit 0): 111 test files / 1,224 tests,
62/62 packed type-consumer checks, Chromium/Next SSR, Vercel Edge and workerd. This verifies the
unchanged implementation baseline, not the new storage contract. At kickoff, all implementation boxes were open.

## Final implementation evidence (2026-11-09)

- **Gate:** `pnpm verify` completed with exit 0 on `task/99-advanced-mock-file-storage`:
  117 test files / **1,279 tests**, 62/62 packed type-consumer checks, unified package/React consumers,
  Chromium (4 checks, Next dev and production), Vercel Edge and workerd. Log:
  `/tmp/apixa-v150-final-verify.log`. No unhandled test errors remain.
- **Storage/defaults/paths/naming/metadata/isolation:** `tests/core/mock-storage.test.ts` (21 cases).
  Existing `mock-files.test.ts` retains its 16 default-behavior cases. Code inspection confirms listing
  only enumerates metadata and read-only builtin calls reuse indexes without transaction scans.
- **Atomicity/ownership/bulk/abort/timeout/reset/concurrency/result boundaries:**
  `tests/core/mock-storage-atomicity.test.ts` (12 cases), including actual mixed generated/explicit ID
  collision with no consumed counter, failed path-reservation retry, private multi-file staging,
  queued cancellation and binary handler result preservation.
- **Fixtures/datasets/strict refs/validation/cleanup/Blob-only runtimes:**
  `tests/core/mock-fixtures.test.ts` (15 cases). Selected-only sequential initialization and repeated
  setup/reset return storage counts to baseline; no records or catalog definitions carry bytes.
- **Adapter parity:** `tests/mocking/mock-file-storage.test.ts` (4 cases), existing adapter regression
  suites and updated one-engine source assertions in `getall-parity.test.ts` / `mock-api-data.test.ts`.
- **Types and React:** `tests/core/mock-storage-types.test.ts` (positive/negative compile checks),
  `tests/react/mock-storage.test.tsx`, existing hook suites and the packed consumer matrix. The existing
  type-only validation hook test disables its unnecessary query and explicitly cleans up; its runtime
  assertions remain intact. Runtime hook tests still use workspace React 19; no claim to close the
  earlier React 18 runtime gap.
- **Runtime workflow:** `scripts/lib/mock-storage-scenario.mjs` is used by packed Node,
  `verify-browser.mjs`, generated Next SSR download pages (dev/production) in
  `verify-unified-consumer.mjs`, and `verify-edge.mjs` (both real Edge engines). It verifies strict
  fixture seeding, disk/path/naming, replacement/download, ownership pins, reset and rehydration.
- **Additional built-Core Node probe:** invalid name/type/timestamp fixture metadata rejects,
  malformed lazy metadata leaves no files, and reset invalidates a manually pending `put`.
- **API/architecture:** export snapshot regenerated using `node scripts/verify-public-api.mjs --update`
  and reviewed: two fixture helpers and five supporting types on existing Core/Mocking subpaths;
  curated root unchanged. No new package, dependency or version change. `graphify update .` completed.
- **Docs/example:** implemented API, ownership/costs and commit boundary documented in architecture,
  public API and READMEs. Tracked runtime/SSR source supplies the example evidence; no ignored local
  Next file is treated as delivered source and no other example app is edited.
- **Remaining for v1.5.0:** none. Owner sign-off recorded on 2026-11-09. Prior v1.1.0–v1.4.0 owner sign-offs, React 18 hook
  coverage and prior local Next validation-scenario evidence remain separately outstanding.

Milestone closure: the owner approved the complete implementation and authorized the commit, PR and squash merge through issue #99. No package version change or npm publication accompanies this closure.

Closure verification: after latest-main synchronization and mandatory `npm run format`, the complete `pnpm verify` gate passed again (exit 0; 117 files / 1,279 tests, 62/62 packed type consumers, Chromium/Next SSR and both Edge runtimes). Log: `/tmp/apixa-v150-finalize-verify.log`.
