# Story

Project log. Newest entry first.

## 2026-11-12 — Grouped examples and a direct Laravel launcher

Regrouped `examples/` by role: `backends/laravel-backend/`, `frontends/query-ssr-next/` (maintained)
and the local frontend playgrounds, plus empty tracked `templates/laravel`, `templates/next` and
`templates/react` placeholders. Updated the pnpm workspace globs, `.gitignore`, tracking rules,
verification scripts, docs and frozen milestone path references to the new locations. No example
code or SDK behavior changed.

Added `scripts/laravel/{macos,linux,win}` launchers and a shared helper. They check PHP, install
Composer dependencies when `vendor/` is missing, create `.env` and an app key when needed, then run
`php artisan serve --host=127.0.0.1 --port=8000 --no-reload` with optional `LARAVEL_HOST`,
`LARAVEL_PORT` and `LARAVEL_ENV` overrides. Database provisioning and migrations remain manual.

## 2026-11-12 — Documentation audit: one living structure

Removed two stale documentation sets: the 18-version `docs/apixa-backlog-versions/` catalog (several
proposals had shipped under v1.x numbering) and the v0.10-era `docs/study-guide.md`. The release
guide moved to `docs/guides/humans/publish-a-release.md`, and the owner-supplied
`publish-library` workflow became a canonical `.agents/skills/publish-library/` skill; publishing
now targets the `latest` dist-tag (`package.json`, `verify-publish-readiness.mjs`). Corrected
published-state claims (`apixa@1.0.0-rc.0` is live on npm `latest` and `next`), rewrote the
roadmap and version status tables around v1.8.1, and refreshed `README`, `docs/context.md`,
`docs/architecture.md`, `docs/external-context.md`, `docs/public-api.md`, `tests/README.md`,
`CONTRIBUTING.md` and the agent guides. No SDK behavior, public export or milestone contract changed.

## 2026-11-12 — Provider-independent AI configuration

Shared engineering rules now live under `.ai/rules/`, with seven reusable workflows in real `.agents/skills/` directories and four shared role definitions. Repository-local synchronization generates Cursor, Codex, Claude Code, Gemini CLI and OpenCode adapters while preserving native settings and hooks; conditional rule metadata is retained instead of flattened by the former generator. Automated migration and filesystem-safety checks accompany the adapters; runtime discovery evidence and provider limitations are recorded in `.ai/README.md`.

## 2026-11-11 — v1.8.1 Laravel/PostgreSQL environment verified locally

The independent Laravel 13.42.0 backend boots on PHP 8.4 with native PostgreSQL 16, empty API routing, configurable built-in CORS and private local storage. All three default migrations ran on the new development database; separate test/E2E connections, four HTTP workers, real health/preflight requests, storage cleanup, two default framework tests and a clean production dependency/cache setup were verified. `pnpm verify` passes unchanged (151 files / 1,600 tests, 62/62 type consumers, Chromium and both edge runtimes). No application behavior, SDK integration, package-version change or deployment was added; PR CI and owner sign-off remain delivery gates.

## 2026-11-11 — v1.8.1 Laravel backend playground kicked off

v1.8.0 is present on main through PR #106 (`b0cf6b4`), with Node 22/24 CI green. Issue #107 starts an independent Laravel 13/PostgreSQL environment under `examples/laravel-backend/`; this milestone provisions configuration and verifies real infrastructure only. The author retains all API design and backend behavior; no SDK changes, npm release or deployment are included.

## 2026-11-11 — v1.8.0 owner decisions resolved: secure redirects and final audit

The owner approved secure-by-default redirects (guidance-only for concurrency and session ids): the fetch transport now inspects
every redirect hop before sending, refuses cross-origin destinations before contacting them, follows an explicit
`redirectOrigins` origin with no headers, cookies or body, and fails closed in browsers, which hide redirect targets. The remaining
audit also fixed shared-object under-counting in file validation and a dataset-id path escape, and proved managed mock writes
atomic with 15 fault-injection tests. `pnpm verify` and Node 22 pass (151 files / 1,600 tests); CI and G4 sign-off are pending.

## 2026-11-11 — v1.8.0 file hardening implemented

Probed all 23 audit findings against real sockets, a fault-injectable session server and direct measurements:
four were confirmed defects and fixed test-first (abort could abort an already-completed upload, a renew/reconcile race
dropped parallel acknowledgments, checkpointing was quadratic in part count, mock path checks allocated per file) with
two files of production change and no public API change. The rest are pinned as non-issues, platform limits or
documented limitations (cached streams stay consumer-owned; custom headers follow cross-origin redirects, which needs
an owner decision), and a production guide states Apixa's guarantees versus backend responsibilities.
`pnpm verify` and Node 22 pass (146 files / 1,540 tests); CI and owner sign-off are pending.

## 2026-11-11 — v1.8.0 kicked off: file lifecycle and production hardening

v1.7.0 is merged (PR #104, squash `03fde16`, CI Node 22/24 green) and v1.8.0 starts as the final
Advanced File Handling phase. Stage 1 created `versions/v1.8.0/` with a static audit and a 23-item
provisional finding register (highest-impact candidates: redirects on ordinary requests,
abort versus completion, a renew/reconcile race, the manual mock-delete contract, quadratic
checkpoint work and multipart buffering under progress), decisions H1–H14, eight batches and owner
gates. Nothing is implemented; Batch 0 must reproduce each finding before any fix.

## 2026-11-11 — v1.7.0 signed off and merged

Node 22 and 24 CI passed on the final head of PR #104 (1,451 tests, 62/62 type consumers, Chromium,
Edge, workerd), and the owner explicitly signed off Large Files & Advanced Transfers with its
documented backend requirements and provider/range-download deferrals. Acceptance criteria are
checked off; the squash merge closes issue #103.

## 2026-11-10 — v1.7.0 prepared for remote verification

Prepared the complete Large Files & Advanced Transfers implementation for issue #103, including
chunk sessions, secure presigned requests, the S3 recipe and runtime/typing regression evidence.
Local verification passed; Node 22/24 remote CI and explicit final owner sign-off remain required
before squash merge, with backend requirements and provider/range-download deferrals retained.

## 2026-11-10 — v1.7.0 implementation: Large Files & Advanced Transfers

Implemented the owner-approved D1–D18 proposal under issue #103 through the single
`/implement-version` invocation. Explicit operation strategies use the existing request pipeline
for bounded Blob slicing, sequential/parallel scheduling, authoritative session reconciliation,
caller-owned checkpoints, SHA-256 chunk identity, safe part retries and lifecycle controls.
Ordinary uploads and downloads retain their existing defaults.

Added `createTransferControl` and specialized transfer types only to `apixa/core`; curated root
exports remain unchanged. Presigned steps isolate credentials and middleware with exact authorized
HTTPS origins and transport capability checks. The tracked Next example includes interruption and
resume plus an SDK-free backend-mediated S3 recipe. Core remains framework independent.

Regression evidence covers unsafe middleware replay, response-limit/caller-option forwarding,
checkpoint recovery, integrity, truthful progress and signed diagnostics/cache identities. See the
[v1.7.0 acceptance evidence](../versions/v1.7.0/acceptance-criteria.md) for final command results. `pnpm verify` passed in full, including 1,451 tests across 138 files,
62/62 packed type checks, React 18/19, Chromium/Next and both Edge runtimes. Node 22 independently
passed all 1,451 tests.
Resumption requires backend support; advanced upload completion must settle its response body.
A provider framework and range downloader remain deferred. Remote CI and final milestone owner
sign-off remain open. No commit, push, package-version change or publication was performed.

## 2026-11-10 — v1.7.0 kickoff: Large Files & Advanced Transfers

Created the [v1.7.0 contract](../versions/v1.7.0/) after auditing v1.1.0–v1.6.0 contracts,
public API, request/retry/security pipeline, serialization, streaming, validation, mocks and React
runtime evidence at `2cdf2e2`. Existing downloads/streams are reused. Missing session orchestration,
checkpoint reconciliation and delegated-origin security are planned through existing operations,
with bounded chunks/parallelism, per-part recovery, integrity and a backend-mediated S3 recipe.
D1–D18 record options, recommendations and trade-offs for owner review; progress, control/native
Promise, mixed read/write step binding, presigned credential/redirect policy and exports are explicit
implementation gates. Range downloads and a public provider adapter require concrete justification.

Stage 1 only: four contract files plus living pointers/roadmap/story; no production code, package
version changes, implementation command, future version folders, commit, push or publish. Broader
cleanup/performance/hardening remains v1.8.0 roadmap work; RHF/Zod remain excluded. v1.6.0 is
implemented, verified and merged, owner sign-off open; its later coverage evidence does not rewrite
older frozen checklists. v1.0.0 remains a release candidate. No fresh `pnpm verify` claim in this audit.

## 2026-11-10 — v1.6.0 framework and consumer integration implemented

Implemented [v1.6.0](../versions/v1.6.0/) through the existing three hooks, with no new public API. The audit confirmed and fixed three defects test-first: a binary value in a query identity (silent cache collision), a caller's `AbortSignal` replaced by TanStack's on reads, and binary/stream data entering `dehydrate`. Real React 18.3.1 and 19 hook scenarios now run against the packed package, and `examples/query-ssr-next` `/files` (rules, progress, cancellation) is driven in Chromium. `pnpm verify` passes (125 files / 1336 tests); owner sign-off remains open.

## 2026-11-09 — v1.6.0 kickoff: framework and consumer integration

Created the [v1.6.0](../versions/v1.6.0/) contract (Advanced File Handling, phase 7); no production code. The audit found React 18 still has no executed hook coverage, the maintained Next file scenarios are untracked (`examples/**` is ignored) while the tracked `query-ssr-next` has none, and unverified cache, stream and dehydration behavior for binary values. The plan is tests, documentation and small proven fixes through the existing three hooks, with an owner decision on the example's location and no new API unless proven.

## 2026-11-09 — v1.5.0 advanced mock file storage completed and approved

Completed v1.5.0: optional disks, safe paths and naming, lazy dataset fixtures, shared-reference cleanup and atomic managed writes extend the existing client-scoped mock store, with `defineMockApi` on the same Core pipeline. The owner signed off the milestone after `pnpm verify` passed (117 files / 1,279 tests, 62/62 packed type consumers, Chromium, Next SSR, Vercel Edge and workerd); issue #99 carries the change through squash merge. Earlier milestone sign-offs and coverage gaps remain open; no package versions are bumped, nothing is published and v1.6.0 is not started.

## 2026-11-09 — v1.5.0 advanced mock file storage implemented and verified

Implemented [v1.5.0](../versions/v1.5.0/) on [issue #99](https://github.com/a2mby/apixa/issues/99).
The existing client-scoped store now supports optional disks/paths/naming, explicit typed fixture
markers and lazy dataset fixtures, metadata filters, shared-reference ownership and fixture pins.
Managed record/file changes commit together after configured mock response checks; failures and
cancellation before commit roll back, reset invalidates pending generations, and finished handlers
reject late writes. External effects and response middleware after commit remain outside rollback.
`defineMockApi` now adapts to the existing Core mocked-client pipeline, preserving its calling
conventions and error mapping while sharing storage and reset behavior. No new engine, package,
dependency or storage driver. `pnpm verify` passes (117 test files / 1,279 tests, 62/62 packed type consumers, Chromium/Next SSR, Vercel Edge and workerd); owner sign-off remains pending.

The tracked shared runtime scenario exercises fixture seed → upload/replace → download → reset in
Node, Chromium, Next SSR (dev/production), Vercel Edge and workerd. No ignored local Next file is
claimed as delivered source. Previous owner sign-offs, React 18 runtime hook gaps and v1.4.0's local
Next scenario evidence remain outstanding; `1.0.0-rc.0` is not declared stable.

## 2026-11-09 — v1.5.0 kickoff: advanced mock file storage

Created the [v1.5.0 contract](../versions/v1.5.0/) after auditing the existing Core store,
`mockFiles` and handler handles, dataset loading, upload cleanup, downloads, validation and transfer
tests. The store already has UUID refs, metadata, resource/field listing and basic reset/rollback;
fixtures, disks/paths/naming and ownership/concurrency guarantees need extension. The contract
recommends one optional disk dimension, paths in metadata, unchanged refs, lazy per-resource fixtures
and coordinated managed commits. Storage drivers are deferred. Handler transaction semantics and
fixture-token/seed/ownership compatibility need explicit decisions before implementation.

Stage 1 only: no production code, dependency/package-version changes, future version folders,
commit, push or publish. v1.4.0 is merged and verified, not declared shipped: owner sign-off,
React 18 runtime hook coverage and delivered/browser evidence for its local Next validation scenario
remain open. Earlier owner sign-offs and the v1.0.0 release-candidate status remain unchanged.

## 2026-11-09 — v1.4.0 file validation, middleware and safety implemented

Implemented [v1.4.0](../versions/v1.4.0/). Opt-in file rules (size, count, MIME, extension, strict filenames) now sit on `fileFields` options with request-level `fileLimits` and per-operation overrides, and `maxResponseSize` / `responseAccept` bound binary responses. One checkpoint after request middleware, shared by live and mocked calls, rejects with the existing `ValidationError` (typed `violations`, no names or contents) before any request, mock write or transfer event; request streams and responses (an oversized failed-response body too, keeping its `HttpError` status) are bounded by the counting stream without buffering. `pnpm verify` passes (111 files / 1224 tests, 62/62 packed type consumers, Chromium, Edge, workerd); owner sign-off and a React 18 runtime hook test remain open.

## 2026-11-09 — v1.4.0 kickoff: file validation, middleware and safety

Created the [v1.4.0](../versions/v1.4.0/) contract (Advanced File Handling, phase 5); no production code. The audit of the v1.3.0 tree found no file limits anywhere, `ValidationError` unused for files, no pre-send checkpoint shared by live and mocked calls, unbounded stream and download reads, and client-controlled MIME/extension data. The plan adds opt-in rules to `fileFields`, one validation step in the existing pipeline, bounded counting for streams and responses, and an explicit statement that client validation is not security.

## 2026-11-09 — v1.3.0 file transfer progress, streaming and reliability implemented

Implemented [v1.3.0](../versions/v1.3.0/). An opt-in, typed `onTransfer` observer (call option or operation default) reports upload and download start / progress / complete / error / abort with the retry attempt, trustworthy totals only, and an explicit `unsupported` where the runtime cannot observe a transfer (workerd and browsers for sized uploads; browsers need HTTP/2 for stream bodies). The batch also fixed a stream that escaped its call's signal and timeout, sent stream request bodies without `duplex`, and made inline call-option callbacks contextually typed. No new package; `pnpm verify` passes. Owner sign-off and React 18 runtime transfer coverage remain open.

## 2026-11-09 — v1.3.0 kickoff: file transfer progress, streaming and reliability

Created the [v1.3.0](../versions/v1.3.0/) contract (Advanced File Handling, phase 4); no production code. The audit of the v1.1.0/v1.2.0 tree found no progress seam in `Transport`, a streamed response that escapes the caller signal and timeout once the operation resolves (`cleanup()` runs in `finally`), stream request bodies sent without `duplex`, and no classification of interrupted transfers. The plan locks an opt-in `onTransfer` design in a Batch 0 spike and promises honesty: no fabricated totals, percentages or acknowledgments.

## 2026-11-09 — React peer guard and npm type-consumer matrix land

The hook peer guard (`RequireTanStackQuery`), the packed-tarball type-consumer verification (`scripts/verify-type-consumers.mjs`, now part of `pnpm verify:consumers`) and the optional-peer install docs shipped as their own change, separate from the v1.1.0/v1.2.0 file-handling work. Missing `@tanstack/react-query` now yields a named error type instead of `any`.

## 2026-11-09 — v1.2.0 file downloads and binary responses implemented

Implemented [v1.2.0](../versions/v1.2.0/). Operations can declare `responseType`, and a literal
`responseType` (operation or call, also through `ctx.request`) now types the result as `Blob`,
`ArrayBuffer`, `string` or `ReadableStream`, with `defineApi<T>()` metadata still winning. Failed
downloads read their error body by content type, explicit text/binary 204s give typed empty values,
unknown `responseType` values throw `ConfigError`, and binary data skips key transforms and JSON
shaping. `parseContentDisposition` reads filenames; mocked operations read the v1.1.0 file store
through a read-only `files` handle and return coerced bodies with content headers. Abort, timeout
and retry behavior needed no change and is now covered by tests. Verified with the full gate (979
tests, 62 npm type-consumer checks, Chromium, Next SSR, Vercel Edge, workerd). Owner sign-off
open. A stray `apixa` self-dependency in the root `package.json` (and lockfile) broke the
architecture test and was removed.

## 2026-11-09 — v1.2.0 kickoff: file downloads and binary responses

Started [v1.2.0](../versions/v1.2.0/), phase 3 of Advanced File Handling. The audit found that
`responseType` (`blob`, `arrayBuffer`, `text`, `stream`) and `{ full: true }` already work per call
but are untyped, cannot be declared on an operation, read failed downloads as blobs, return `null`
for 204 whatever the type, and have no tests; mocks cannot serve uploaded files and nothing parses
`Content-Disposition`. The contract adds operation-level `responseType` with type inference,
truthful error and empty bodies, `parseContentDisposition`, and mock downloads from the existing
v1.1.0 store, with no new package and no separate download client. Contract only: v1.1.0 stays
implemented with owner sign-off open, and its work is not yet committed to `main`.

## 2026-11-09 — Remove the stale structure.txt snapshot

Deleted `structure.txt`, a hand-kept directory tree from an older layout that nothing referenced.
`docs/architecture.md` remains the single source map of the repository.

## 2026-11-09 — v1.1.0 release blocker: hooks typed `any` without TanStack

A real npm consumer of `1.0.0-rc.0` saw `useResource` / `useResourceQuery` return `any`
(`useResourceMutation` stayed typed). Cause: `@tanstack/react-query` is an optional peer, npm does
not install optional peers, and an unresolved import in declarations is an error type that makes
`any & UseQueryResult<…>` `any`. pnpm workspaces always had it, so every check passed. Fix: every
hook overload returns `RequireTanStackQuery<…>` (`packages/react/src/peer.ts`), which becomes a
named `ApixaMissingPeer_Install_tanstack_react_query` interface when TanStack does not resolve.
New `scripts/verify-type-consumers.mjs` installs the packed tarball with npm outside the workspace
and checks core-only, React 18/19 with and without TanStack, three TypeScript versions, two module
resolution modes, and skipLibCheck on/off. Documented limit: `skipLibCheck: true` hides the
unresolved-module error itself. Recorded in [v1.1.0](../versions/v1.1.0/).

## 2026-11-08 — v1.1.0 file handling implemented

Implemented [v1.1.0](../versions/v1.1.0/) after the owner expanded and finalized its scope. Core now
chooses JSON or multipart per request (multipart automatically when a body holds `File` / `Blob`;
`dataFormat` overrides; binary is never JSON-stringified), with a documented bracket / repeated-name
encoding, aliases, JSON-encoded fields, `SerializationError`, and `Content-Type` removal so the
transport sets the boundary. `fileFields` is entity-checked and derives `File | Blob` inputs for
`create` / `update` / `patch` / `upsert` / `createMany`. Mocked resources store uploaded bytes in a
per-client virtual file store (`mockFiles`) with string references in records, replacement and
cleanup, and all-or-nothing writes. The earlier plan to defer mock storage to a later phase was
reversed by the owner; advanced storage (disks, fixtures, lifecycle) stays planned. Full
`pnpm verify` passed (925 tests, packed consumers, Chromium, Vercel Edge, workerd). Nothing was
committed, pushed, published or version-bumped.

## 2026-11-08 — v1.1.0 audit and `fileFields` type contract

Audited Core before coding: `serializeBody` already passes `FormData`/`Blob` through but would
`JSON.stringify` a plain body holding a `File` into `{}`, `transformKeys` already leaves `File`/`Blob`
untouched, middleware sees the public body before serialization, and `FormData` is replayable across
retries. Added the type-level contract only: `fileFields` (array or `{ name }` object, checked against
the entity), derived `File | Blob` inputs for `create`/`update`/`patch`/`upsert`, and an
operation `dataFormat` (write operations only). Reads are unchanged. There is no runtime yet, so
`validate.ts` still rejects `fileFields` loudly. Design decisions are recorded in the v1.1.0
implementation plan; six remain open. Nothing was exported, committed, pushed or published.

## 2026-11-08 — Start v1.1.0: file-field foundation (Phase 1 of 9)

Kicked off [v1.1.0](../versions/v1.1.0/) — Advanced File Handling, Phase 1. The contract covers
resource-level `fileFields`, entity-checked names, derived `File | Blob` write inputs with `string` /
`string[]` reads, automatic multipart, an operation `dataFormat` override, and binary-safe
serialization/middleware. The nine-phase file roadmap is recorded in `docs/roadmap.md`; only this
folder was created. `v1.0.0` was checked first: only `apixa@1.0.0-rc.0` is published and there are
no tags, so it is not treated as stable and its folder is untouched. Eleven design decisions (D1–D11)
are open in the implementation plan. No library code, version bump, commit, push or publish.

## 2026-11-08 — One npm package, private modular implementations

The owner's final v1 decision supersedes the four-publication plan: only `apixa@1.0.0-rc.0`
will be published. Core, Mocking, React and shared helpers keep their source boundaries as private
workspace modules. One code-split runtime build and a separate canonical declaration emit preserve
identity and framework independence. All 14 `apixa` paths and their symbol snapshots remain unchanged.
The former scoped package paths are development identities, not public installation paths; errors
now recommend only `apixa/mocking/register` and `apixa/mocking/node`. Consumer, browser and Edge
checks use one tarball. Scope ownership no longer blocks this packaging. The final checkout fallback in the Node helper
recognizes both private and public build layouts. Verification passed 841 tests (76 files),
single-tarball consumers on Node 22/24, Chromium, workerd and Vercel Edge Runtime; npm dry-run
confirms `a2mby` can publish the root package. See
[ADR 005](./decisions/005-single-package-distribution.md). Nothing was published, committed or pushed.

## 2026-11-07 — Release-candidate hardening (Phase 3)

The four packages were verified as a release candidate and the audit found one real defect: thrown
errors exposed the outgoing `Authorization` header and request body to `console.log` and error
reporters. `ApiError.request` and `.response` are now non-enumerable (still readable). Verification
grew to match the claims: public exports are checked against declarations and a snapshot, the Next.js
example runs in real Chromium, and the packed facade runs in `workerd` and the Vercel Edge Runtime.
The architecture checker's failure detection is tested. The `@apixa` npm scope is owned by a different
npm user than the one logged in here, so publishing `@apixa/*` is blocked until that is resolved; see
[the release guide](./guides/humans/publish-a-release.md). Nothing was published.

## 2026-11-07 — `apixa` facade and `@apixa/react` (Phase 2)

`@apixa/tanstack-query` is now `@apixa/react` (it was never published under the old name), and the
root `apixa` package is a re-export facade over `@apixa/core`, `@apixa/mocking` and the optional
`@apixa/react`: a curated root plus `apixa/core`, `apixa/mocking*` and `apixa/react[/advanced]`. The
React package gained `ApixaProvider`, an Apixa `QueryClient` (TanStack's, with `staleTime`, `gcTime`,
`retry`, `networkMode` and `meta` shorthands), `ApixaHydrationBoundary` and `dehydrate`; `QueryClient`
and `dehydrate` also live in the React-free advanced entry so Server Components can prefetch. Its
two entries are now one code-split build, which gives them a single shared `QueryClient`. All four
packages are at `1.0.0-rc.0` with Node 22+; nothing has been published. Packed consumers cover a
root-only install without React, React 18 and 19, Vite, and Next.js production and development with
Server Component prefetch and hydration. The facade's declarations are built per entry because a
single multi-entry build made `apixa/core`'s types import `@apixa/react`.

## 2026-11-07 — Architecture contract and shared integration layer (Phase 1)

Four public packages (`apixa`, `@apixa/core`, `@apixa/mocking`, `@apixa/react`) and one private
shared layer are now the documented target ([ADR 004](./decisions/004-four-packages-and-private-shared-internals.md)).
Implemented: `@apixa/internal-shared` with the resource key algorithm and operation classification
moved out of the TanStack package (behavior unchanged, bundled into its output), a dead Core
declaration that named a Mocking module removed, and `pnpm check:architecture`, which checks
dependency direction, cycles, framework and Node leakage, private imports and built output with the
TypeScript module graph. Not done yet: the `apixa` facade, the `@apixa/react` rename, `ApixaProvider`
and `QueryClient`; the migration map is in [public-api.md](./public-api.md).

## 2026-11-07 — Unified npm package prepared

The root `apixa` manifest now builds a publishable Core entry and optional Mocking and React
subpaths from the existing packages. A packed consumer verifies the root can run without React or
unpublished `@apixa/*` installs, while the React path works when its peers are present. No npm
publication or version bump has occurred.

## 2026-11-07 — Mock handler types and cancellation verified

The v1.0.0 Mocking work now has compile-time coverage for `defineApis` handler records, nested path
parameters, and raw handler responses under response transforms. Cancellation tests found and fixed
a race that could start a handler after an async mock provider finished loading, even though the
request had already been aborted. The Core, Mocking, packed-consumer, and tracked example gates pass.

## 2026-11-07 — Custom declarative operations can define their own mock behavior

A custom declarative operation now takes an optional `mock` handler with typed `records`, a small
copy-safe `store`, path `params`, `query`, `body` and `signal`, so a mocked `getActive` or `archive`
does exactly what the author wrote instead of being unsupported. Without a handler the operation
still rejects with `MOCK_UNSUPPORTED`, and on a live resource the handler is ignored. The same
engine, client-scoped stores and request lifecycle serve it; no second operation registry exists.

## 2026-11-07 — Mocking stabilized for v1.0.0

A custom declarative operation on a mocked resource no longer runs a builtin because its path looks
like an id; it rejects with `MOCK_UNSUPPORTED`, mock writes refuse prototype-changing keys, and
`@apixa/mocking` takes Core as a peer dependency. `defineMockApi` now shares Core's `getAll`
contract (same filters, pages and `slice`), paginated reads copy only their page (100,000 rows: 169
ms to 0.04 ms), and each synthetic dataset has its own import path. `pnpm typecheck` now covers the
tracked example and CI runs the packed-consumer checks. See the CHANGELOG for the migration notes.

## 2026-11-07 — v1.0.0 Query hardening verified and recorded

`useResource` helper types now match runtime precedence for reserved names. New tests pin
idempotency across every retry layer, request-scoped SSR isolation, concurrency stress, and
infinite edge cases. The v1.0.0 scope, plan, and acceptance criteria now include the Query DX work;
seven acceptance items are checked, including runtime runs on the TanStack 5.90.1 peer minimum and
real-browser hydration. The full v1 release item stays open.

## 2026-11-07 — Stale fetches can no longer replace confirmed mutation data

A fetch sent before a write reached the server is now restarted when the write succeeds, instead of
landing afterwards and restoring old data on optimistic or inactive entries. Deterministic race and
manual-cache-takeover tests cover the behaviour, and the Query README documents the optimistic
ordering model. Part of the v1.0.0 Query hardening.

## 2026-11-06 — Query DX: prefetch, cache, infinite, optimistic, and mutation state

The three Query hooks now cover prefetching, typed cache access, cancellation, infinite lists, live
mutation state on each write function, and declarative optimistic updates that stay correct under
concurrent calls, with no new hooks and no custom cache or scheduler. Advanced server prefetch
helpers back the updated `query-ssr-next` example. This advances the v1.0.0 Query workstream.

## 2026-11-06 — Opt-in idempotency keys on Core writes

Write operations can declare `idempotency: true` or `{ header, generate }`, and Core then sends one
`Idempotency-Key` per call, reused across Core retries and an error-middleware replay. Reads reject
it at type and runtime level; `createIdempotencyKey` lets integrations reuse a key across their own
retries. This is an opt-in Core addition alongside the v1.0.0 Query workstream, not a scope item.

## 2026-11-06 — Expose Cursor commands to Claude and Codex, add `/ship-changes`

`.claude/commands`, `.claude/skills` and `.agents/skills` now symlink to `.cursor/`, so Claude Code and
Codex can use the same commands and skill. `/ship-changes` reads the working tree, opens one or more
issues, and lands each on `main`. The sync script no longer drops the `## graphify` section of
`AGENTS.md`.

## 2026-11-06 — Remove the `@apixa/mocking/data` entry points

`@apixa/mocking/data` and `@apixa/mocking/data/users-mock` were only compatibility re-exports of
`@apixa/mocking/datasets`, so both are gone. Records and entity types now come from `/datasets`;
`/register` and `/node` remain as internal tooling.

## 2026-11-06 — Explicit operation kinds and the final TanStack Query hooks

Core now requires `kind: "read" | "write"` on every custom operation, rejects `kind` on built-ins, and
validates kind against HTTP method at construction and per `ctx.request()`. `useResourceQuery`
exposes reads only, `useResourceMutation` writes only (no single-operation overload, no
`readOperations`), and `useResource` is a thin composition with top-level `mutations`. This advances
the v1.0.0 Query workstream; the breaking changes are listed in `CHANGELOG.md`.

## 2026-11-06 — Finalize `@apixa/mocking` entry points and mock-store memory

`@apixa/mocking/datasets` is now the canonical dataset entry: lazy `loadDataset(id)` plus eager
direct named imports (the six small synthetic sets). `/data` and `/data/users-mock` remain as
compatibility re-exports; `/node` and `register` are unchanged (register imports a lazy-only
`loader`, so it never loads records). `MockSource.immutable` lets a store reset from the
module-cached built-in dataset instead of keeping a private snapshot (~48% less heap per store in
`scripts/measure-mock-memory.mjs`); inline arrays and providers keep their snapshot. `slice` is
documented as a seed window — the full JSON is still imported. Added packed-consumer and
browser-bundle verification (`scripts/mocking-consumer.mjs`).

## 2026-11-06 — `defineMockApi` follows the `defineApi` structure

`defineMockApi({ resources: { … } })` is now the main form: resources live under `resources`, and
the operation-selection settings (`defaultOperations`, `readOnly`, `writeOnly`, `operationGroups`)
can be set on the root as shared defaults (resource wins; groups merge per group). Selection runs
through Core's own `expandOperations`, and the client type reuses Core's `KnownOpName` /
`MaybeOpName`, so a disabled method is absent from autocomplete and type checking. Handlers in
`operations` get a typed `ctx` and builtin arguments from the dataset with no annotations; custom
operations infer their arguments and return from the handler. HTTP-shaped operation objects are
rejected (no local meaning). The flat `{ users: "users-mock" }` form remains as a compatibility
shorthand. Core now exports `expandOperations`, `BUILTIN_CONVENTIONS`, `KnownOpName`, `MaybeOpName`.

## 2026-11-06 — Harden Query parity and explicit mocking register (#65)

Named mock datasets now load only after an explicit `@apixa/mocking/register` import (Core
`registerMockDatasetLoader`), instead of a dynamic Core import of the mocking package.
`@apixa/tanstack-query` tightens `useResource` / plain-signature / mutation-callback parity with
native TanStack, bumps the React Query peer floor to 5.90.1, and extends consumer verification
scripts and tests. Advances the in-progress v1.0.0 Query workstream.

## 2026-11-04 — Land v1.0.0 TanStack Query workstream (#63)

Shipped the Query workstream under `versions/v1.0.0/`: Core operation `kind` / metadata so
integrations can classify reads vs writes without verb heuristics; query-only
`useResourceQuery` (inherited reads, tracked re-render parity, signal-by-position); resource-wide
`useResourceMutation` plus the existing single-op form; `useResource` facade; advanced
`createResourceQueryOptions`; SSR Next example; and hardening tests. Full product v1 publish
remains open per acceptance criteria.

## 2026-11-04 — Add proposed backlog version catalog under docs/ (#60)

Checked in the planning-only tree at `docs/apixa-backlog-versions/` — eighteen proposed
milestones (`v0.12.0`–`v0.29.0`) with context/scope/plan/acceptance drafts, kept outside
`versions/` so none become an active coding contract until `/start-version`. Index at
`docs/apixa-backlog-versions/backlog/README.md`; roadmap links to it for later work. (The catalog
was removed on 2026-11-12 because several proposals shipped under v1.x numbering; git history keeps
the drafts.)

## 2026-11-04 — Complete the defineApi architecture: resources, defineApis, client-scoped mocking (#58)

Implemented Parts C–F of the defineApi architecture specification on top of #57.

- **Configuration:** Resources now live under `resources`. `defineApis()` reuses the same
  engine. Configuration is validated when the client is built, unknown keys are rejected at
  compile time and at runtime, and clients are frozen.
- **Mocking:** Removed global mock processors and the pathname-matched mock transport. Mocking
  is now a data-first, client-scoped execution branch backed by one `MockStore` that
  `defineMockApi` also uses. It supports dataset IDs, inline records, providers, and
  `{ data, idKey, seed }`. All 15 advertised datasets now resolve, each loaded lazily on its
  own. A mocked resource never falls back to the network.
- **HTTP lifecycle:** Added header providers, origin checks after middleware, a single
  timeout/retry/abort lifecycle, and hook-style middleware in three styles sharing one
  pipeline.
- **Transforms:** Added typed recursive key transforms (root, resource, and operation level) that throw on collisions.
- **Middleware:** Error middleware gets `replay()` for token-refresh flows, and operations with an unknown body type accept an omitted body.
- **Tests:** The suite grew from 247 to 443 tests.

## 2026-11-04 — Land defineApi operation and type refactor (#56)

Aligned `defineApi`'s generated methods with literal runtime resource configuration while keeping
the explicit metadata and inferred call forms. Consolidated builtin defaults and group membership,
renamed the public bulk methods to `createMany` / `deleteMany`, and made the four specialized
builtins execute independent requests. Added default/group/individual selection, cross-origin
operation-path protection, mock ID filtering, and TanStack support for partially disabled resources.

## 2026-11-04 — Land v0.11.0 harden leftovers (#54)

Closed the stacked post-v0.10 hardening that had to wait for a separate issue: `ParseError` on
malformed declared-JSON bodies, a single `decideRetry` per failed attempt, and
`useResourceMutation` for builtins/custom ops outside `useResourceQuery`. Froze
`versions/v0.11.0/` and added `docs/study-guide.md` (removed on 2026-11-12 as a stale v0.10-era
snapshot; see git history). Several acceptance items (mock store clone,
extended mock routes, `readOnly` / pagination typing, path validation, composed-builtin delegation)
had already shipped inside the v0.10.0 land via shared files — this issue documents that and lands
the remaining dedicated pieces.

## 2026-11-04 — Land v0.10.0 fully customizable resource operations (#52)

Shipped `operations` as config object, function, or `false` per key on both `defineApi` and
`@apixa/mocking`, with 11 always-on builtins (`getBySlug`, `patch`, `upsert`, `count`, `search`,
`bulkCreate`, `bulkDelete`, `getMany`, `exists`, `findFirst`, `getBy`) next to the original CRUD
five. Custom ops call as `api.resource.<name>()`; suggested-keys typing covers all 16 names.
Acceptance criteria for `versions/v0.10.0/` checked. Follow-up hardening (parse failures, mock
bridge gaps, TanStack coverage) stays for a separate v0.11.0 issue — some shared-file prep already
rode along in this tree and will be scoped there.

## 2026-11-02 — Revise v0.10.0 builtins to always-on; add `getBy` (#52)

Direction change, by direct user request: the 11 builtins added in v0.10.0 (10 originally scoped

- a new `getBy` general lookup) flip from opt-in-only to **always-on** for any resource with a
  `path` — the same default-first treatment the original 5 have had since v0.2.0. No `operations`
  entry is needed to call `api.users.count()`, `api.users.exists(id)`, etc.; `false` still removes
  one by name. Added `getBy(fieldOrPath, value)`: a `:placeholder` in the first argument
  interpolates, otherwise the value is appended as a path segment — a general escape hatch for a
  one-off custom field/key lookup without a preset convention. Mirrored on `@apixa/mocking`
  (`getBy` finds by any given field name against the in-memory store). Simplified Core's
  `inference.ts` (the old "referenced opt-in" branch collapses into the same always-on branch as the
  original 5). Updated `tests/core/default-operations.test.ts`, `tests/core/define-api.test.ts`,
  `tests/mocking/mock-api.test.ts` (now expect all 16 names), `examples/next/lib/api.ts`
  (simplified — builtins no longer need declaring), and all v0.10.0 planning docs + `docs/conventions.md`
  / `docs/context.md` / `docs/architecture.md` / `CHANGELOG.md` to match. `pnpm typecheck` and
  `pnpm test` (188 tests, 27 files) pass. Still uncommitted on `task/52-customizable-resource-operations`.

## 2026-11-02 — Implement v0.10.0 Fully customizable resource operations (#52)

Shipped `operations` accepting a config object, a function, or `false` per key on both
`defineApi` and `@apixa/mocking` resources. `false` removes a builtin (no-op if inactive); a
function runs through a bound `ctx.request()` / `ctx.rows()` + `ctx.defaults` helper instead of
reimplementing the pipeline, and is called exactly like a generated operation. `operations` now
suggests the 15 known names via `OperationsBag<V>` while still accepting arbitrary custom keys.
Added 10 opt-in builtins (`getBySlug`, `patch`, `upsert`, `count`, `search`, `bulkCreate`,
`bulkDelete`, `getMany`, `exists`, `findFirst`) — never auto-expanded; `exists` / `findFirst` /
`getMany` are composed over `getById` / `getAll`, not new backend routes. Mirrored the same
surface on `@apixa/mocking` (`mock: "<dataset-id>"` and `defineMockApi`); documented that the
generic mock REST store only simulates the wire shapes it already understood (plus `patch` /
`upsert` for free), the same honesty as an unimplemented real backend route. 33 new tests across
Core and mocking; `pnpm typecheck` and `pnpm test` (184 tests) pass. Implementation only — not yet
merged to `main`.

## 2026-11-02 — Start v0.10.0 Fully customizable resource operations

Opened [`versions/v0.10.0/`](../versions/v0.10.0/) to let `operations` accept a config object, a
function, or `false` per key — on both `defineApi` and `@apixa/mocking` resources — with custom and
built-in operations surfacing identically as `api.resource.<name>()`. Locks 10 new opt-in builtins
(`getBySlug`, `patch`, `upsert`, `count`, `search`, `bulkCreate`, `bulkDelete`, `getMany`, `exists`,
`findFirst`) and suggested-keys typing for `operations` autocomplete. Contract and pointers only — no
implementation in this kickoff.

## 2026-11-01 — Land v0.9.0 Flatten Core mock syntax

Shipped `mock: "<dataset-id>"` on `defineApi` resources (removed `mock: true` / `mockConfig`). Resource-level `pagination` sits next to `path` / `slice` / `mock`. Core `MockDatasetIds` lists known catalog ids for autocomplete without importing `@apixa/mocking`. `defineMockApi` accepts string shorthand. Next playground + docs/tests updated.

## 2026-11-01 — Start v0.9.0 Flatten Core mock syntax

Opened [`versions/v0.9.0/`](../versions/v0.9.0/) to collapse `mock: true` + `mockConfig` into `mock: "<dataset-id>"`, put `pagination` beside `path` / `slice` / `mock`, fill Core `MockDatasetIds` for autocomplete without importing `@apixa/mocking`, and add `defineMockApi` string shorthand. Contract and pointers only — no package implementation in this kickoff.

## 2026-10-30 — Land v0.8.0 Unified TanStack Query resource integration

Shipped `@apixa/tanstack-query` with primary `useResourceQuery` (list state + Promise CRUD/`getById` + invalidate + `mutations.*`). Internals: key factory, controller `queryOptions`/`mutationOptions`, invalidate-first cache with D1 callback order. Escape hatch `@apixa/tanstack-query/advanced`. Next playground migrated; tests under `tests/tanstack-query/`. Core remains React-free. Deferred: `patch-list`, optimistic helpers, infinite queries, auto custom ops.

## 2026-10-30 — Start v0.8.0 Unified TanStack Query resource integration

Opened [`versions/v0.8.0/`](../versions/v0.8.0/) for optional `@apixa/tanstack-query` with non-negotiable unified `useResourceQuery` DX. Locked D1–D5 in the implementation plan: callback composition order, mutation concurrency/pending semantics, inference from Apixa signatures, query-key identity (scope + list params), and invalidate-first v1 cache (defer `patch-list` / optimistic / infinite). Contract and pointers only — no package implementation in this kickoff.

## 2026-10-30 — Align mockApi getAll typing with defineApi lists (#45)

`defineMockApi` `getAll` is now strictly `T[]` or `Page<T>` (no `Page | T[]` fallback). Next `api` / `mockApi` users both return `User[]`; paginated `Page` stays on comments. Playground query uses `data ?? []` typed as `User[]` so TanStack defaults are not `never[]`.

## 2026-10-30 — Align Core builtin name with mocking: `getById` (#43)

Renamed `defineApi`’s builtin `getByID` → `getById` (conventions, `BuiltinOpName`, `ResourceClient`, docs, tests) so it matches `defineMockApi`. Breaking; no alias. Shipped `versions/` folders left historical.

## 2026-10-30 — Mock `slice`, full users-mock, drop users-sample; land v0.7.0 (#41)

Renamed mock `size` → `slice` (`number` | `{ start, end }`) with `InvalidSliceError` under `MockingErrors`; Core `users-mock` now seeds all 100 rows; removed `users-sample` / `@apixa/mocking/data/users`. Also shipped v0.7.0 thin Core + plugin seams (path-param concat, `full` / re-callable middleware, extension interfaces, structured error codes).

## 2026-10-21 — Start v0.7.0 Thin Core + plugin seams

Opened [`versions/v0.7.0/`](../versions/v0.7.0/) to make Core thin and stable: types cleanup, body/query runtime, RequestOptions (`full` / `responseType` / `meta`), breaking middleware re-call model, retry hooks, extension seams (mock keys move to `@apixa/mocking` augmentation), and structured error codes. Auth/cache/validation/pagination helpers stay out. Contract and pointers only — no implementation in this kickoff.

## 2026-10-21 — Land v0.6.0 Core request reliability (#39)

Shipped abort/`AbortSignal` + timeout product surface (`AbortError` / `TimeoutError`), opt-in `retry` (safe `GET`/`HEAD` defaults, exponential backoff), and thin ordered `middleware` wrapping the retry loop. Selective mock transport honors `AbortSignal`; Next `lib/api.ts` demos the config. Core-only; schema hooks and live pagination conventions remain planned.

## 2026-10-21 — Start v0.6.0 Core request reliability

Opened [`versions/v0.6.0/`](../versions/v0.6.0/) for first-class abort/`AbortSignal`, documented timeouts, configurable retries, and thin middleware. Core-only; no client/server packages, schema library, TanStack package, or live pagination conventions. Contract and pointers only — no reliability implementation in this kickoff.

## 2026-10-21 — Ignore Next local scaffolding in git (#36)

Git keeps only the Next demo API surface (`README`, `app/page.tsx`, `lib/api.ts`, `lib/comments.ts`, `lib/mock-api.ts`). Local scaffolding (`package.json`, `tsconfig.json`, layout/components/query client, etc.) stays on disk for running the app but is gitignored.

## 2026-10-21 — Paginated mock pages through TanStack Query (#34)

Kept `defineMockApi` honesty: `pagination: true` → `Page<T>` (`data`, `total`, `page`, `pageSize`, plus `previous` / `next` page numbers). Next example wires `useQuery` to the page envelope and reads `.data` in the UI — no unwrap helper.

## 2026-10-18 — Human and agent how-to guides (#32)

Added `docs/guides/` with `humans/` and `agents/` folders: short task guides (extend `MockDatasetIds`, fix a small bug, plan-and-land via `/plan-change` + `/git-push`). Conventions and the docs Cursor rule point at the new tree so contributors and agents share the same how-to home.

## 2026-10-18 — MockDatasetIds autocomplete for mockConfig.type (#30)

Core exports an empty extensible `MockDatasetIds`; `@apixa/mocking` data modules merge preset ids next to `registerDatasetPreset`, so importing `@apixa/mocking/data` teaches `mockConfig.type` autocomplete while still accepting custom strings. Builtins cover the small synthetic presets; mocking README documents the customize-your-own pattern. `/git-push` now always runs `npm run format`, and Prettier-only diffs outside Touches are allowed.

## 2026-10-18 — Resource mocks without side-effect mocking import (#28)

Core treats `@apixa/mocking` as an optional peer: when `defineApi` sees unhandled `mock` / `mockConfig`, it strips those keys and deferred-loads `@apixa/mocking/register` on first request. No side-effect `import "@apixa/mocking"` is required; missing peer yields a clear error. Extends shipped v0.5.0 without a new versions folder.

## 2026-10-18 — Standalone `defineMockApi()` in `@apixa/mocking`

Added `defineMockApi({ users: { type, size, pagination } })`: a local, in-memory mock API with typed CRUD, pagination, and isolated state per call — no `defineApi()`, transport, or network. Datasets load lazily from the root `datasets/` JSON (one chunk each); `@apixa/mocking/data` exports typed records and entity types. Removed `createMockTransport` (and the unusable `createSelectiveMockTransport` export). Core and its resource-level `mock` / `mockConfig` processor are untouched. Three datasets (`states-csc`, `states-parseapi`, `counties-parseapi`) are not exposed: too large, and two have non-unique ids.

## 2026-10-18 — Resource-level mock / mockConfig on Core defineApi (#25)

Core gained a generic `registerDefineApiProcessor` extension point; `@apixa/mocking` registers a processor that honors resource `mock` / `mockConfig` (selective Transport, in-memory CRUD, size + pagination envelope) without a second `defineApi`. Typed presets ship as `@apixa/mocking/data/*`. Global `createMockTransport` kept for compatibility.

## 2026-10-18 — Land v0.5.0 Simple Mocking and dataset collection (#23)

Shipped `@apixa/mocking` (browser-safe transport + `@apixa/mocking/node` loaders), removed FastAPI `backend/` and backend scripts, and filled root `datasets/` with domain folders, `manifest.json` provenance, and `ATTRIBUTION.md`. Imported CC0/ODbL geography/reference sets; generated deterministic synthetics (Faker seed `230523`) where redistribution was unclear. Core production Fetch path unchanged; online catalog remains planned only.

## 2026-10-18 — Expand local mock dataset collection (#23)

Filled root `datasets/` with domain folders (`geography`, `reference`, `users`, `companies`, `products`, `orders`, `social`, `comments`), `manifest.json` provenance, and `ATTRIBUTION.md`. Imported CC0 parseapi lists + ODbL CSC/mledoze (cities capped to capitals). Skipped unclear/restricted sources (DummyJSON, country-codes combo, catalog sites); substituted deterministic Faker/PRNG synthetics (seed `230523`). Registry walks nested folders. Build script: `pnpm datasets:build`.

## 2026-10-18 — Land v0.5.0 Simple Mocking

Shipped `@apixa/mocking` (`loadDataset`, `listDatasets`, `createMockTransport`), root `datasets/users-sample`, Next + basic examples on mock transport, and removed FastAPI `backend/` plus backend run scripts. Core production Fetch path unchanged (no Core `mocks` API). Online catalog remains planned only.

## 2026-10-18 — Start v0.5.0 Simple Mocking

Opened [`versions/v0.5.0/`](../versions/v0.5.0/) for local JSON datasets, an `@apixa/mocking` registry + mock `Transport`, and removal of the FastAPI `backend/`. No website or hosted catalog in this milestone. Contract and pointers only — no mocking implementation in this kickoff.

## 2026-10-18 — Land v0.4.0 entity-only `defineApi<T>()` state typing

Replaced branded `type<T>()` markers with a resource-only Zustand-style state: `defineApi<AppApi>()({ … })` where `AppApi` declares `path` + `entity`. Core derives `create` / `update` (`Omit` / `Partial` on `"id"`), types root builtins separately, and adds `BuiltinHeaders`. `type` / `Type` / `Infer` are removed from `@apixa/core`.

## 2026-10-18 — Add Prettier root format command

Installed Prettier at the workspace root with `.prettierrc.json` and `.prettierignore`. `npm run format` (and `pnpm format`) now formats supported source and docs across the monorepo while skipping build outputs, lockfiles, and local examples.

## 2026-10-18 — Land v0.3.0 `type<T>()` markers

Implemented branded `type<T>()` / `Type<T>` / `Infer` in `@apixa/core`. Operation `body` / `response` accept markers only; inference unwraps them; `{} as T` no longer type-checks. Tests, Next example, README, and `CHANGELOG.md` updated. Follow-ups `crud<>()` and path-param inference remain planned.

## 2026-10-18 — Retarget GitHub owner to a2mby

Living docs, README, `/plan-change`, and `/git-push` now point at `a2mby/apixa` after the account rename from `a2mbyd`. Added [`docs/external-context.md`](./external-context.md) so external agents get the same owner and planning rules before a change brief.

## 2026-10-10 — Start v0.3.0 resource typing

Opened [`versions/v0.3.0/`](../versions/v0.3.0/) as the active coding contract: branded `type<T>()` markers for per-operation `body` / `response`, with `Infer` unwrap and a breaking move away from `{} as T`. Reliability work (abort, retries, middleware) moves to a later roadmap heading. No Core code in this kickoff — contract and pointers only.

## 2026-10-10 — Land v0.2.0 contract and living docs

Froze [`versions/v0.2.0/`](../versions/v0.2.0/) as the active coding contract and marked v0.1.0 completed. Living docs, README, and Cursor rules now describe default-first resource CRUD to match Core already on main. Acceptance criteria for v0.2.0 are checked off.

## 2026-10-10 — Resource client builtins complete in TypeScript

`ResourceClient` now declares required `getAll` / `getByID` / `create` / `update` / `delete` keys so IDEs complete `api.users.…` without `Awaited<ReturnType<…>>`. Empty or missing `operations` still yields the same surface at runtime via `expandOperations`. Next example (local) uses path-only `users` without `ReturnType` gymnastics.

## 2026-10-10 — Core folder-per-concern; untrack examples

Restructured `@apixa/core` internals into folders (`api/`, `operation/`, `request/`, `errors/`, `types/`, `http/`, `transport/`) with short single-purpose modules. Public exports unchanged; only `index.ts` remains at `src/` root. Ignored `examples/**` in git so playgrounds stay local for now.

## 2026-10-10 — Land v0.1.0 Core and frontend playgrounds

Merged `@apixa/core` `defineApi`, the Vitest suite (fake Transport), Next-first multi-framework examples, and macOS/Linux/Windows frontend run scripts onto main. `/plan-change` now requires a Tests section for functional changes so the suite keeps growing. v0.1.0 acceptance criteria are complete.

## 2026-10-09 — Frontend examples (Next-first)

Added framework playgrounds under `examples/` that consume `@apixa/core` against the FastAPI backend: **Next.js** (primary — RSC + client mutations), React+Vite, Vue, vanilla DOM, Angular, and React Native (Expo), plus the existing Node `basic` CLI. Platform scripts under `scripts/{macos,linux,win}/run-frontend-*.{sh,bat}` (shared helper in `scripts/lib/`). Root scripts: `pnpm example:next` (and `:react`, `:vue`, `:vanilla`, `:angular`, `:react-native`).

## 2026-10-09 — v0.1.0 Core: defineApi

Implemented `@apixa/core` against the v0.1.0 contract: `defineApi()` with opt-in resource operations, native `Promise<T>` (unwrapped data), Fetch as the default in-Core transport, and injectable `Transport` for tests. Custom operation definitions override convention defaults; unconfigured methods are not generated. Production `mocks` / auth / logging middleware are not part of the public API.

Example (`examples/basic`) and README show the implemented client. Root Vitest suite under `tests/core/` covers definition, overrides, URL building, success, and HTTP/network errors. `pnpm typecheck` and `pnpm test` pass.

## 2026-10-09 — SETUP THE REPO

Landed the full Apixa workspace on main: living docs, v0.1.0 coding contract, Core and basic example packages, FastAPI backend with platform run/stop/restart scripts, tests placeholder, and Cursor rules/commands/skill for the docs/versions workflow. Core `defineApi` implementation is still ahead under v0.1.0.

## 2026-10-09 — Cursor rules, skill, and commands for structure

Added always-on and path-scoped rules under `.cursor/rules/`, the `apixa-workflow` skill, and commands `/start-version`, `/implement-version`, `/check-structure`. Retargeted `/plan-change` and `/git-push` to `a2mbyd/apixa` and wired them to the docs/versions workflow.

## 2026-10-09 — Docs structure for v0.1.0

Landed the living docs layer (`architecture`, `roadmap`, `conventions`, ADRs) and the frozen coding contract under `versions/v0.1.0/`.

Next: implement Core against `versions/v0.1.0/implementation-plan.md` — `defineApi()`, configurable generated operations, Fetch transport in Core, example + tests.
