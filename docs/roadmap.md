# Roadmap

This roadmap describes milestone status and possible future capabilities. Do not implement future
items all at once. The active coding contract is always the current version folder under
[`versions/`](../versions/README.md).

The development milestone number is **not** the npm package version. Only the `apixa` release
candidate `1.0.0-rc.0` is published; v1.1.0–v1.8.1 are repository milestones that require a build
of the matching checkout.

## Milestone index

| Milestone      | Status                                                            | Topic                                                |
| -------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| v3.0.0         | **Release candidate** — `3.0.0-rc.0` verified (not npm-published) | Coordinated Core architecture overhaul               |
| v1.9.0         | Carried forward into v3 where applicable; not released separately | DX and bug fixes, starting with live pagination      |
| v1.8.1         | Environment verified locally; PR/sign-off pending                 | Laravel/PostgreSQL/MongoDB playground                |
| v1.8.0         | Merged (PR #106); CI green; final sign-off not inferred           | File lifecycle, performance and production hardening |
| v1.7.0         | Completed and owner-signed-off 2026-11-11 (PR #104)               | Large files and advanced transfers                   |
| v1.6.0         | Implemented and verified (PR #102); owner sign-off open           | Advanced framework and consumer integration          |
| v1.5.0         | Completed; owner sign-off recorded 2026-11-09                     | Advanced mock file storage                           |
| v1.4.0         | Merged and verified; owner sign-off open                          | File validation, middleware and safety               |
| v1.3.0         | Merged; owner sign-off open                                       | Transfer progress, streaming and reliability         |
| v1.2.0         | Merged; owner sign-off open                                       | Downloads and binary responses                       |
| v1.1.0         | Merged; owner sign-off open                                       | Advanced file handling, phase 1                      |
| v1.0.0         | Release candidate only — `apixa@1.0.0-rc.0` published, not stable | Query/mutation DX, single-package distribution       |
| v0.11.0        | Shipped                                                           | Harden v0.10.0 and close analyzed gaps               |
| v0.1.0–v0.10.0 | Shipped                                                           | Foundation through customizable operations           |

Exact delivery evidence and frozen checkboxes live in each folder and in
[`versions/README.md`](../versions/README.md). A merged milestone is not an npm release.

## Active: v3.0.0 — Core architecture overhaul (`3.0.0-rc.0` RC)

**Spec:** [versions/v3.0.0/](../versions/v3.0.0/) · [umbrella issue #112](https://github.com/a2mby/apixa/issues/112)

Implemented and verified the approved breaking redesign across operations (13 builtins, derived HTTP
kinds, `{ body }` write calls and `{ params }`), unified `middleware[]`, query/body serialization,
response processing (`unwrap`, `parse`, `validate`, `source`), safe transforms, and opt-in per-operation
pagination, preserving existing advanced capabilities. Prepared and verified `apixa@3.0.0-rc.0` without
publishing to npm.

## In progress: v1.9.0 — DX and bug fixes

**Spec:** [versions/v1.9.0/](../versions/v1.9.0/)

Core-only milestone for developer-experience problems and bugs found by using Apixa against real
backends. First item: live pagination. `pagination` currently shapes only types for live resources;
this adds a runtime mapping with a default (apixa's own shape), a `laravel` preset, a field-path
object and a `parseList` escape hatch, with `ParseError` on missing fields. No auto-detection, new
package, version bump or npm release.

## Previous: v1.8.1 — Laravel Real-World Backend Playground

**Spec:** [versions/v1.8.1/](../versions/v1.8.1/)

Independent Laravel 13 backend environment at `examples/backends/laravel-backend/`: native PostgreSQL,
MongoDB documents, empty API routing, configurable built-in CORS, local storage, separate
development/test/E2E environments, multi-worker local serving and production configuration
guidance. The author owns all future APIs and business behavior. No SDK integration, Node
dependency, application scenarios, npm release or deployment. v1.8.0 is merged (PR #106), CI Node
22/24 green; no owner sign-off inferred.

HTTP operations remain blocked for manual testing until the author adds real endpoints. The
playground currently provides seeded data and models, not application APIs.

## Merged: v1.8.0 — File Lifecycle, Performance & Production Hardening

**Spec:** [versions/v1.8.0/](../versions/v1.8.0/) (merged in PR #106; owner decisions resolved; CI Node 22/24 green; owner final sign-off not inferred)

- Secure-by-default redirects for ordinary requests (owner-approved breaking security correction; optional `redirectOrigins`)
- Hardening, not a feature family: audit lifecycle, atomicity, memory/CPU, stream ownership, security, transfer-session races, error consistency, mock/live parity and runtime compatibility across v1.1.0–v1.7.0
- Fix only confirmed defects (regression test first); document limits; no remote-file deletion, no distributed-transaction promises
- Deterministic fault injection and measured memory/CPU thresholds; one consolidated production guide
- Owner gates G1–G4; no public API, package or dependency without approval; no release

## Completed: v1.7.0 — Large Files & Advanced Transfers

**Spec:** [versions/v1.7.0/](../versions/v1.7.0/) (implemented, verified, merged as PR #104 and owner-signed-off 2026-11-11)

- Explicit advanced strategies through existing API operations and Core request infrastructure;
  ordinary small-file uploads/downloads remain unchanged and require no new configuration
- Lazy File/Blob chunks, protocol-supported sessions/resume, bounded sequential/parallel transfer,
  caller-owned typed checkpoints, authoritative reconciliation and safe per-part recovery
- Honest aggregate progress, integrity evidence, shared cancellation/deadlines and explicit controls
- Presigned upload/download security with owner-reviewed origins, credential and redirect policy
- Tested backend-mediated S3-compatible recipe without mandatory SDKs; public adapters only if justified
- Audit/reuse existing large streamed downloads; range resume only on a proven gap and explicit approval
- D1–D18 and the precise API proposal owner-approved; implemented through one Core pipeline, no new package/client

## Implemented, owner sign-off open: v1.6.0 — Advanced Framework & Consumer Integration

**Spec:** [versions/v1.6.0/](../versions/v1.6.0/) (implemented and verified; owner sign-off open)

- Hook-level runtime coverage of uploads, downloads, progress, cancellation, errors, mocks and
  invalidation through `useResourceQuery`, `useResourceMutation` and `useResource`
- React 18 **and** 19 runtime verification against the packed package (closes the gap recorded since v1.3.0)
- Next.js SSR/hydration rules for Blob, File and stream values; fixes only for audit-proven defects
- A tracked, Chromium-driven Next example for upload, download, progress, cancellation and validation
- No new hooks, packages or dependencies unless the owner approves a proven need

## Completed: v1.5.0 — Advanced Mock File Storage

**Spec:** [versions/v1.5.0/](../versions/v1.5.0/) (completed and verified (`pnpm verify`); owner sign-off recorded 2026-11-09)

- Extend the existing per-client in-memory mock store; no-config behavior and UUID refs remain
- Optional logical disks, safe virtual paths and configurable naming; metadata/listing on existing handles
- Lazy runtime-neutral fixtures connected to datasets, with bytes separate from records
- Ownership-aware replacement/deletion/reset and atomic managed file/record commits
- Preserve uploads, downloads, validation, transfer events, typing and browser/Node/SSR/Edge support
- Driver interfaces, real storage providers and broad lifecycle policy engines remain deferred
- Batch 0 decisions are locked: explicit fixture markers, strict opt-in refs and transactional managed handlers

## Implemented, owner sign-off open: v1.4.0 — File Validation, Middleware & Safety

**Spec:** [versions/v1.4.0/](../versions/v1.4.0/) (implemented and verified; owner sign-off open)

- Opt-in file rules on the existing `fileFields` options: per-file and total size, file count, MIME
  `accept`/`reject`, extensions, filename checks; operation-level overrides, one documented precedence
- One validation step in the existing pipeline (after request middleware, before serialization,
  transport and mock execution); no new hooks, no new package, no schema dependency
- Safe, typed `ValidationError` (`violations` with codes and paths, never contents or names)
- Streams and downloads bounded by pull-based counting (no unbounded buffering, backpressure kept);
  `maxResponseSize` for binary responses
- Mock/live parity; a rejected mocked write leaves the virtual file store untouched
- Explicit trust boundary: client validation is developer experience; the backend must re-validate

## Implemented, owner sign-off open: v1.3.0 — File Transfer Progress, Streaming & Reliability

**Spec:** [versions/v1.3.0/](../versions/v1.3.0/) (implemented and verified; owner sign-off open)

- One opt-in, typed `onTransfer` event mechanism (start, progress, complete, error, abort, with
  retry `attempt`) on `RequestOptions` and operations; no second client or package
- Download progress for every `responseType`; `total` only from trustworthy `Content-Length`
- Upload progress only where the runtime can observe bytes; otherwise an honest "unsupported"
  signal, never a fabricated percentage
- Streaming bodies with backpressure; a `stream` result stays cancellable and time-limited after the
  operation resolves; interrupted transfers classified consistently; retry rules unchanged
- Typed through builtins, custom operations, `ctx.request()` and hooks; verified through React
  18/19, packed npm consumers, Chromium, Node, Next, Vercel Edge and workerd

## Implemented, owner sign-off open: v1.2.0 — File Downloads & Binary Responses

**Spec:** [versions/v1.2.0/](../versions/v1.2.0/)

- Operation-level `responseType` (declarative operations; per call still wins) that **infers** the
  result type: `Blob`, `ArrayBuffer`, `string`, `ReadableStream`; metadata `response` still wins
- Download metadata through the existing `{ full: true }` `ApiResponse`, plus a pure
  `parseContentDisposition` helper
- Binary-safe pipeline: no JSON parsing, key transforms or builtin shaping; failed downloads keep a
  readable `HttpError` body; truthful 204 values for explicit binary modes
- Mock downloads read the v1.1.0 virtual file store from `mock` handlers (headers synthesized,
  isolation and reset preserved)
- Verified through React 18/19, packed npm consumers, Chromium, Node, Next SSR, Vercel Edge and
  workerd. Implemented and verified (`pnpm verify`); owner sign-off open. One published `apixa` package.

## Implemented, owner sign-off open: v1.1.0 — Advanced File Handling, first release

**Spec:** [versions/v1.1.0/](../versions/v1.1.0/)

- Resource-level `fileFields` (shorthand or `{ name }`), checked against the entity; reads keep
  `string` / `string[]`, eligible writes accept `File | Blob`
- JSON by default; multipart chosen automatically when a body holds binary values; operation
  `dataFormat` override; documented bracket / repeated-name serialization
- Minimal in-memory mock file storage (bytes separate from records, string references on reads)
- Binary-safe pipeline, `SerializationError`, React type compatibility; no new packages
- Implemented, verified (`pnpm verify`) and merged; owner sign-off open. One published `apixa` package.

## Release candidate: v1.0.0 — Query/mutation DX and single-package distribution

**Spec:** [versions/v1.0.0/](../versions/v1.0.0/)

- Step 1 (#62): `useResourceQuery` is query-only; `useResourceMutation` runs every write (create /
  update / delete / builtins / custom); controller split into query + mutation controllers
- Query workstream: native v5 options/results, typed built-in and declared custom reads,
  query-options factory, cache controller, cancellation, App Router hydration, and consumer builds
- Resource-wide `useResourceMutation`, the `useResource` facade, and Core `kind` classification
- Final packaging: one `apixa` npm package, private modular workspaces, optional framework peers
  and isolated public subpaths (ADR 005). Vue and Angular remain future work.
- Only `apixa@1.0.0-rc.0` is published; no stable `1.0.0` release has been declared.

## Shipped: v0.1.0–v0.11.0

| Version | Topic                                                                  |
| ------- | ---------------------------------------------------------------------- |
| v0.11.0 | `ParseError`, single retry decision per attempt, `useResourceMutation` |
| v0.10.0 | Fully customizable operations; sixteen builtins                        |
| v0.9.0  | Flat resource mock configuration (`mock: "<dataset-id>"`)              |
| v0.8.0  | Unified TanStack Query resource integration (`useResourceQuery`)       |
| v0.7.0  | Thin Core, raw bodies, query serialization, envelopes, retry hooks     |
| v0.6.0  | Cancellation, timeouts, retries, middleware reshape                    |
| v0.5.0  | Local datasets, `@apixa/mocking`, FastAPI backend removed              |
| v0.4.0  | Entity-only `defineApi<T>()` state typing; markers removed             |
| v0.3.0  | `type<T>()` markers (removed in v0.4.0)                                |
| v0.2.0  | Default-first resource CRUD and partial overrides                      |
| v0.1.0  | Opt-in operations foundation                                           |

## Planned: remaining file-handling phase

The nine-phase file program is complete except phase 2 (extended CRUD/custom serialization), which
has no separate version folder because existing CRUD/custom-operation coverage is audited rather
than claimed fully exhaustive. A dedicated React Hook Form adapter is a separate optional
milestone, not part of this roadmap's active line.

## Later: developer experience follow-ups

- Optional schema validation hooks (without baking in a schema library)
- Operation `deprecated` / versioning metadata
- Dataset catalog codegen from `datasets/manifest.json` (tooling, not library surface)
- `crud<>()` preset
- Online dataset catalog (browse/download); local datasets only today

## Later: integrations and runtime

- Vue, Angular and other framework adapters (each with its own public subpath and optional peers)
- Browser and server convenience packages
- Secure server-only configuration (secrets must not leak to browser bundles)
- Ranged/resumable downloads (streamed downloads already exist)
- Additional transports extracted from Core
- OpenAPI import/export

## Later: platform

- Reusable resource definitions and API versioning
- Observability and tracing
- CLI tooling and optional code generation
- Plugin ecosystem

## Dependency direction (all phases)

```text
integrations → core
core ↛ integrations
```

Core remains framework-agnostic. Caching and UI state management stay outside Core.
