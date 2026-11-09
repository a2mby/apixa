# v1.5.0 — Scope

Status: **completed and verified (`pnpm verify`); owner sign-off recorded 2026-11-09**. Locked decisions S1–S12 live in
[implementation-plan.md](./implementation-plan.md).

## In scope

| Area                      | Included behavior                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional organization     | One logical disk/namespace dimension in the existing client store, default disk when omitted; resource-local opt-in defaults. No second namespace hierarchy.                                                                        |
| Virtual paths             | Relative directory-like paths in metadata; portable normalization and traversal rejection. Paths never change reference identity.                                                                                                   |
| Naming                    | Existing original-name behavior by default; opt-in unique stored names and deterministic callbacks/UUID generation for tests; collision failures never overwrite another file.                                                      |
| Fixtures                  | Small runtime-neutral descriptors/helper for text, bytes and Blob inputs; a lazy factory for selected fixtures; metadata-only setup until used. No URL fetcher or filesystem requirement.                                           |
| Datasets                  | Optional resource fixture registry alongside existing mock data. Seed records refer to registry keys or already stored refs; only selected records' declared file fields resolve. Records hold ordinary refs after materialization. |
| Metadata                  | Extend `MockFileMeta` with disk/path and a separate original name only if naming changes the stored name; retain all existing fields and immutable snapshots. Lifecycle ownership stays internal.                                   |
| Inspection and resolution | Extend existing storage `list` filters and read-only handler handle for disk and directory-prefix queries; preserve ref/bare-ID retrieval, `isMockFileRef`, bytes/blob/text and downloads.                                          |
| Isolation                 | Independent bytes, IDs, fixture caches and cleanup per client; resource ownership and disk scoping prevent accidental deletion/sharing. Shared client storage remains deliberately inspectable.                                     |
| Lifecycle                 | Create, retrieve, replace through resource writes, delete, resource/client reset and explicit storage clear; fixture rehydration and stale-ref rules; protect refs still in use. No separate replace client API.                    |
| Atomicity                 | Private staging and coordinated record/file commit in the existing engine, fixture loading and managed handler writes; cancellation, reset generations, duplicate IDs, binary-read failures and concurrent calls tested.            |
| Determinism/performance   | Injectable naming/UUID generation and fixture timestamps; stable listing order, bounded serial fixture loading, no binary reads during listing and no byte copies on ordinary record reads.                                         |
| Integrations              | Existing uploads, validation checkpoint, binary downloads, middleware and honest transfer events; mocks never reach the network.                                                                                                    |
| Types/runtimes            | Additive TypeScript inference and packed declarations; browser, Node, Next SSR, Vercel Edge and workerd; Blob fallback when File is absent.                                                                                         |
| Documentation             | Implemented usage in READMEs, architecture and public API when code lands; Next-only example if needed, with evidence separate from gitignored local files.                                                                         |

## Out of scope

| Item                                                                          | Reason                                                                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| New engine, storage client, package or mandatory dependency                   | Extend existing abstractions and single distribution.                                                                                             |
| Public driver interface or filesystem/database/cloud/S3 adapter               | No second backend requirement; speculative API cost.                                                                                              |
| Filesystem fixture discovery, remote fixture fetching, large binary catalog   | Runtime portability and controlled loading. Existing Node dataset loader remains unchanged unless a narrow compatibility fix is proven necessary. |
| Path-based refs, signed refs or automatic migration of existing refs          | Existing UUID reference compatibility.                                                                                                            |
| Disk ACLs, tenants/security sandbox, separate disk and namespace layers       | Logical organization only.                                                                                                                        |
| Directory entities, rename/move/copy APIs, glob query language, search engine | Directory prefixes and existing resource replacement cover this milestone.                                                                        |
| Arbitrary user-code side-effect rollback or cross-resource transaction API    | Only engine-managed state can be transactional; compatibility gate must settle legacy handler behavior.                                           |
| Quotas, TTL, background GC, content deduplication/hashing, encryption         | Later policy/performance work, not needed for mock lifecycle correctness.                                                                         |
| Mock stream downloads, resumable/chunked uploads, parallel transfers          | Existing stream-mock behavior preserved; later file-handling phases.                                                                              |
| RHF, Zod, Laravel/React/Next dependencies in Core; unrelated networking       | Explicit exclusions.                                                                                                                              |

## Affected components

| Component                                              | Responsibility                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (private)                              | Existing storage, source/record stores, handlers, lifecycle/pipeline, config validation and inference. Core owns runtime-neutral fixture descriptors if it must interpret them. |
| `packages/mocking` (private)                           | Fixture convenience exports, dataset loading integration and `defineMockApi` parity; depends on Core, never reverse.                                                            |
| `src/` facade                                          | Re-exports only; expose justified additions through existing specialized subpaths, no new root convenience API by default.                                                      |
| `packages/react`, `packages/internal/shared` (private) | No planned production changes; preserve existing integration behavior and tests.                                                                                                |
| Root tests/scripts/docs; `examples/next`               | Regression, consumer and runtime evidence; no other example edited.                                                                                                             |

## Compatibility boundaries

Preserve no-argument storage construction, `put(blob, { resource, field })`, list(resource/field),
clear(resource), synchronous `resetMock`, missing low-level reads (`undefined`), missing handler reads
(`MOCK_NOT_FOUND`), delete's boolean result, native promises and all existing imports. New metadata
fields should be optional in public structural input types where required for source compatibility;
normalized entries always have a disk and path. No new response wrapping or validation opt-out.

Automatic managed cleanup may become safer when a ref has multiple owners; low-level delete/clear
remain deliberate destructive tools and may leave stale record refs. Define and document this
boundary instead of silently rewriting records. Changes to legacy custom-handler write/abort
semantics or rejection of previously accepted seeded refs require the explicit Batch 0 decision.
