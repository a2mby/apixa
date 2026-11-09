# v1.5.0 — Context

Frozen milestone context. Living direction: [`docs/context.md`](../../docs/context.md).
Status: **completed on task/99-advanced-mock-file-storage; verified (`pnpm verify`); owner sign-off recorded 2026-11-09**.

## Goal

Advanced Mock File Storage (Advanced File Handling, phase 6): evolve the existing client-scoped
in-memory store into a simple virtual storage system with optional organization, reusable fixtures
and reliable lifecycle behavior. Extend the existing engine; keep ordinary uploads configuration-free.

> Common workflows should work without configuration; unusual backend requirements should remain configurable.

## Identity and existing architecture

One published npm package, `apixa`; private Core, Mocking, React and internal/shared workspaces.
Core owns `MockFileStorage`, mock execution and the shared request lifecycle (ADR 003). Mocking owns
dataset records, loaders and `defineMockApi`, using the same engine. Follow
[`docs/architecture.md`](../../docs/architecture.md) and
[`docs/public-api.md`](../../docs/public-api.md); this contract describes additions, not a replacement architecture.

The audited baseline is `main` at `729407a` (v1.4.0 merged). Uploads, binary downloads, transfer
observation and file validation are implemented. v1.1.0–v1.4.0 owner sign-offs remain open.
v1.4.0 also retains the React 18 runtime hook-test gap and an uncommitted/gitignored Next validation
scenario without browser evidence. Starting this contract closes none of those gates. The last
shipped milestone is v0.11.0; `1.0.0-rc.0` is a release candidate, not a stable release.

## Audit: implemented, partial and missing

| Capability                                         | Evidence in the current tree                                                                                                         | Assessment                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-client store shared by that client's resources | `packages/core/src/api/client.ts`: `buildClient`, WeakMap entries; `api/reset.ts`: `mockFiles`                                       | Implemented. Passing a resource to `mockFiles` still exposes the whole client's storage; preserve this behavior.                                                                                                                                                                |
| UUID refs and byte retrieval                       | `mock/files.ts`: `put`, `isMockFileRef`, `get`, `meta`, `has`                                                                        | Implemented: `mock-file://<id>/<encoded-name>`, bare-ID lookup, immutable metadata, defensive byte copies; no object URLs. Predicate checks syntax, not existence or UUID validity.                                                                                             |
| Metadata and listing                               | `mock/files.ts`: `MockFileMeta`, `list`                                                                                              | Implemented: id, ref, name, type, size, lastModified, createdAt, resource, field; resource/field filters only. No disk/path/naming configuration.                                                                                                                               |
| Upload lifecycle                                   | `mock/files-exec.ts`: `runMockWithFiles`                                                                                             | Partial: create/createMany/update/patch/upsert stage files; replacement/deletion removes old refs; catch removes staged bytes. Staged entries enter the visible map before record commit. Shared-reference ownership is not tracked.                                            |
| Record consistency                                 | `mock/store.ts`: `ready`, `createMany`, `reset`                                                                                      | Partial: lazy single-flight load, cloned records, seeded reset, explicit duplicate-ID checks. Bulk inserts still happen sequentially; generated-ID collisions or late failures need characterization. Reset does not invalidate in-flight loading/staging.                      |
| Custom mock handlers                               | `mock/handler.ts`: `runMockHandler`, `MockFilesHandle`                                                                               | Partial: files are read-only; missing reads throw `MOCK_NOT_FOUND`. Record handle writes are immediate; abort races the handler and explicitly does not roll back its writes. Arbitrary handler side effects cannot be undone.                                                  |
| Dataset loading                                    | `mock/source.ts`, `mock/datasets.ts`, `packages/mocking/src/loader.ts`, `load.ts`, `types.ts`                                        | Records only. Inline/provider/named sources and seed slices exist. Bundled records are module-cached; Node JSON loader is isolated. No fixture registry or materialization. Strings may hold refs but are not resolved or checked on seeding.                                   |
| Downloads, limits and events                       | `request/pipeline.ts`, `mock/files.ts`, `tests/core/mock-downloads.test.ts`, `transfer-mock.test.ts`, `file-validation-mock.test.ts` | Implemented: handler files resolve stored data, binary metadata synthesized, shared pre-execution validation and exact mock response-size checks. Mock upload is unsupported observation; sized downloads report actual bytes. Mock stream responses remain `MOCK_UNSUPPORTED`. |
| Coverage                                           | `tests/core/mock-files.test.ts`, `mock-handlers.test.ts`; `tests/mocking/datasets-*.test.ts`                                         | Existing rollback, reset, byte-copy, download and isolation evidence; no namespace/path/fixture/ownership or concurrency guarantee. New tests must establish those.                                                                                                             |

### Adapter integration gap

`packages/mocking/src/mock-api.ts` calls `resource.ts`, which constructs Core `MockStore` and
runs `runBuiltin` directly. It does **not** currently construct `MockFileStorage`, use the request
pipeline or register the adapter client in the `mockFiles`/`resetMock` WeakMap. Its custom callbacks
receive `rows()` through `liveRows()` and reindex in `finally`; engine sharing does not yet mean
file-storage or cancellation parity. v1.5.0 must connect this adapter to the existing Core storage
and lifecycle helpers, preserving its calling conventions and `MockApiError` translation. Do not
assume passing an adapter client to `mockFiles` works today or build another file engine for it.

## Principles that bind this release

1. Preserve the in-memory default, existing reference formats, imports and no-config behavior.
2. One store per client; disks organize that store and are not security boundaries or new clients.
3. Keep bytes outside records and dataset JSON. Keep cached dataset definitions free of client state.
4. Reuse metadata, handles, errors, middleware, validation and the one mock execution branch.
5. Commit managed file bytes and record references together; failures and cancellation before commit
   publish neither. Specify the commit boundary honestly for failures after commit.
6. Core remains framework-independent and free of Node filesystem and storage-provider dependencies.
7. Add only APIs needed for these workflows. Drivers and speculative adapter interfaces remain deferred.

## What success looks like

An existing file-upload mock continues to work unchanged. A developer can optionally organize files
by disk/path, seed a small dataset using reusable fixtures, inspect metadata, retrieve/download the
same bytes, and reset without stale fixture references or interference with another client/resource.
Deterministic setup and injected failures prove ownership and atomicity. Exact proposed choices and
compatibility-sensitive approval gates are in [implementation-plan.md](./implementation-plan.md).

## Intentionally out

Production filesystems, cloud/S3, presigned URLs, storage drivers, chunking/resume/parallel transfer
orchestration, RHF, Zod, new framework packages and unrelated networking. Phase 9's general lifecycle
policy engine, quotas, TTL/background cleanup and release hardening remain later work. Basic mock
cleanup and bounded fixture work are required here. No implementation, package-version change,
commit, push or publish is authorized by milestone initialization.
