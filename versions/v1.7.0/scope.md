# v1.7.0 — Scope

Implementation scope, with D1–D18 and the precise API proposal owner-approved on 2026-11-10.
Stage 1 created this contract; the subsequent request authorized planning and implementation under
issue #103. Actual verification and remaining sign-off gates are in acceptance criteria.

## In scope

| Area                    | Included behavior                                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection               | Explicit optional advanced strategy on an existing operation; ordinary behavior stays the default regardless of size. Decide the exact configuration seam before coding.                                                                                                                       |
| Sources                 | One selected File/Blob per logical transfer, including a selector from an existing resource body; preserve other entity fields for backend-specific finalization. Multi-file bodies remain unchanged unless explicitly selected. Reacquire source bytes after restart.                         |
| Chunking                | Lazy Blob/File slicing, configurable positive chunk size, deterministic offsets/identifiers, exact final-part boundary and backend-specific assembly configuration. Empty-source behavior must be explicit per protocol.                                                                       |
| Sessions                | Explicit initiate, inspect/reconcile, upload-part, complete and optional server-abort/URL-renew capabilities, all through Core requests. No universal wire endpoint convention.                                                                                                                |
| Resume                  | Track confirmed parts/ranges; reconcile with authoritative server state before skipping work. Handle expired/unknown sessions, stale checkpoints, source changes and ambiguous completion. Resume only on a backend with the needed capabilities.                                              |
| Scheduling              | Sequential uploads and explicitly supported parallel independent parts; configurable finite concurrency, backpressure, bounded buffers, no duplicate completion or uncontrolled fan-out. Multiple operation calls stay independent.                                                            |
| Reliability             | Existing per-request retry policy applied to replayable parts, stable per-session/part identities and protocol-supported idempotency; recover partial failures without resending confirmed work. Shared overall transfer deadline and cancellation across requests/backoff.                    |
| Checkpoints             | Versioned typed metadata with source identity, protocol/version, session, effective chunk layout, confirmed parts and verification state; caller-owned save/load, no binary content or credentials. Minimal callback interface only if justified.                                              |
| Integrity               | Bounded chunk hashing using available web crypto, source-identity checks, backend-declared checksum/verification rules; distinguish local hashes from server verification. Whole-file verification uses a bounded server/protocol mechanism or explicitly reports unavailable.                 |
| Progress/control        | Individual part progress and accurate aggregate confirmed-byte state, optional observed in-flight bytes where supported, explicit pause/cancel/server-abort/resume semantics. Preserve existing `onTransfer` contract; new aggregate/control shape needs approval.                             |
| Presigned transfers     | Backend-issued temporary upload/download URLs and explicit renewal/reconciliation. Approved destination policy after middleware, isolated authorization/credentials, exact signed URLs and headers, safe redirects and redacted diagnostics. Signing and secrets stay on the backend.          |
| S3-compatible protocols | Evaluate and prove a minimal backend-mediated multipart flow (initiate, presign parts, ETags, inspect, complete/abort, recovery) with deterministic simulation. Ship a recipe using the common seam; a public provider adapter requires concrete need and owner approval. No AWS SDK required. |
| Large downloads         | Audit and regression-test existing streaming, limits, progress, cancellation and byte preservation. Range/resumable download implementation only if Batch 0 establishes a real gap, compatible server and separately approved bounded contract.                                                |
| Integration             | Builtins via explicit overrides and custom operations, `ctx.request()`, validation, middleware, error classification, inference, three React/TanStack hooks, packed consumers and Node/browser/SSR/Edge engines.                                                                               |
| Mocking                 | Deterministic fake-transport protocol server for orchestration tests; explicit unsupported behavior or configured handlers on mocked resources, no live fallback. Reuse existing mock store only for final small fixture artifacts.                                                            |
| Delivery                | Maintained Next example, implementation documentation, measurable recovery/security/runtime tests and final `pnpm verify`.                                                                                                                                                                     |

## Affected components

| Component                            | Responsibility during subsequent implementation                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core` (private)            | Definitions, optional orchestration in existing `transfer/`, request lifecycle, validation/security seams, typed state and errors as justified.  |
| `packages/mocking` (private)         | Compatibility and minimal parity only if needed; no provider or session engine.                                                                  |
| `packages/react` (private)           | Existing hooks consume Core operations; source changes only for demonstrated integration defects.                                                |
| `packages/internal/shared` (private) | No planned production changes; only reusable framework-neutral Core-based algorithms if proven necessary.                                        |
| `src/` (`apixa`)                     | Approved re-exports only, through existing entry points; no client implementation.                                                               |
| Root `tests/`, `scripts/`, docs      | Protocol simulations, typing, packed/runtime verification and implemented usage.                                                                 |
| `examples/frontends/query-ssr-next`  | Tracked Next transfer/recovery scenario driven by Chromium. `examples/frontends/next` remains a local playground; no other example apps touched. |

No new workspace/public package or mandatory runtime dependency. No package-version changes.

## Out of scope

| Item                                                                                                          | Reason / destination                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Automatic chunking of ordinary uploads or new mandatory options                                               | Existing zero-config behavior must remain stable.                                          |
| Separate transfer client/SDK, direct fetch in strategies, duplicated networking                               | All steps use Apixa infrastructure.                                                        |
| Universal protocol, guessed backend routes, fabricated progress/checkpoints/acks                              | Backend capabilities must be explicit and evidenced.                                       |
| Generic public storage-driver registry or AWS/cloud SDK dependency                                            | Recipe first; an adapter is gated on concrete requirements.                                |
| S3 signing, credentials provisioning, buckets, ACLs, IAM and cloud account management                         | Server/application responsibilities.                                                       |
| Automatic localStorage/IndexedDB/filesystem database, background service, cross-tab/process locking framework | Caller owns durable persistence and source reacquisition.                                  |
| Resume of non-seekable arbitrary streams, automatic reconstruction of lost file bytes                         | File/Blob slicing and supplied source only.                                                |
| Automatic parallelization of file arrays, batch job scheduler or global concurrency service                   | Independent explicit transfers suffice; no global registry.                                |
| Range downloads without a proven protocol gap and owner decision                                              | Preserve existing streaming; conditional extension only.                                   |
| Whole-file buffering for hashes, mandatory hashing dependency, MD5/ETag equivalence                           | Bounded memory and truthful integrity claims.                                              |
| RHF, Zod, new framework integrations or networking protocols                                                  | Separate optional milestones after file handling.                                          |
| Lifecycle policies, TTL/GC, broad performance audit and production release hardening                          | v1.8.0 roadmap only; safety/resource bounds for this implementation remain mandatory here. |
| Commit, push, release, publish, version bumps, future version folders                                         | User requires stopping after implementation/verification.                                  |

## Compatibility boundaries

Existing file-field/read/write types, paths, symbols, hook signatures, JSON/multipart selection,
`dataFormat`, `responseType`, `full`, retry defaults, error texts and stream behavior remain stable.
HTTP `multipart/form-data` is body serialization; S3 multipart upload is a multi-request session
protocol. They must never be selected or documented as synonyms.

An advanced operation still returns its inferred domain result as `Promise<T>` (and the documented
`full` envelope where applicable), not a custom thenable or transfer handle. Session controls and
checkpoint observation require an additive approved seam. Read/write classification is preserved;
custom write orchestration must not silently bypass today's `ctx.request` method-kind rules for
status GET requests. No breaking change or cross-origin exception without owner review.
