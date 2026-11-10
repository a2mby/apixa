# v1.7.0 — Context

Frozen milestone context. Living direction: [`docs/context.md`](../../docs/context.md).

## Goal

Extend Apixa's centralized request architecture with explicit advanced large-file transfers:
chunking, protocol-supported resume, bounded parallelism, checkpoints, safe recovery, integrity
verification and presigned destinations. Every network step remains an Apixa operation/request.

> Common workflows should work without configuration; unusual backend requirements should remain configurable.

**Status: implemented; final verification evidence is recorded in acceptance criteria.** The owner
approved the precise API proposal on 2026-11-10, replacing an earlier request for changes. One
`/implement-version` invocation follows issue #103; final milestone sign-off and remote CI remain
separate delivery gates. Baseline observations below describe the pre-implementation tree.

## Identity (this release)

- Advanced File Handling, phase 8: **Large Files & Advanced Transfers**.
- One published `apixa` package; manifest remains `1.0.0-rc.0`. Starting this milestone neither
  publishes nor declares v1.0.0 stable.
- Existing private modules: `packages/core`, `packages/mocking`, `packages/react`,
  `packages/internal/shared`; `src/` is a re-export-only facade.
- Runtime-neutral orchestration belongs in Core. React calls native Promise operations;
  Mocking continues to supply datasets and adapters to Core's existing mock engine.
- Audit baseline: `main` commit `2cdf2e2` (v1.6.0, PR #102). Previous milestone is implemented,
  verified and merged; owner sign-off remains open. Its frozen final CI checkbox remains
  unchecked despite the recorded merge/CI evidence; do not rewrite it in this initialization.

## Baseline and inherited behavior

The audit covers all six milestone contracts and their implementation, not just roadmap headings.
The source/evidence inventory and remaining gaps are in the plan's baseline table.

- v1.1.0: typed file fields, automatic multipart **when binary values are present**, configurable
  serialization, binary-safe middleware, minimal client-scoped mock file storage. It also covers
  `createMany`; phase 2 has no separate version folder and is not universally declared complete.
- v1.2.0: typed binary responses, metadata and downloads through the same pipeline.
- v1.3.0: per-request/per-attempt progress, pull-based streams, cancellation and stream lifetime.
- v1.4.0: opt-in file rules, shared post-middleware validation and bounded response reads.
- v1.5.0: mock disks/paths, lazy fixtures, managed transactions and reference ownership.
- v1.6.0: runtime coverage through the three React hooks and packed React 18/19 consumers,
  tracked Next `/files`, binary query-identity rejection, combined read signals and omission of
  binary/stream data from dehydration. Cached streams remain consumer-owned.

v1.5.0 has recorded owner approval. Earlier open owner sign-offs are not granted by this kickoff.
Existing v1.6.0 evidence closes React 18 and tracked-example coverage gaps without editing older
frozen checklists. Prior verification evidence is historical; this Stage 1 audit does not claim a
new `pnpm verify` run.

## What success looks like

An explicitly configured existing resource operation sends a File/Blob using a backend's declared
session protocol. It slices only needed bytes, bounds active requests, retains confirmed parts,
reconciles after interruption, verifies the protocol's integrity requirements and resolves its
ordinary `Promise<T>` only after authoritative completion. A restart can resume after the caller
reacquires the same source and supplies a compatible checkpoint; the backend must support recovery.

Normal small-file uploads, downloads, JSON, file-field inference, error messages, middleware,
`onTransfer`, hooks and imports keep their existing behavior and require no new configuration.
There is no automatic file-size threshold selecting a different protocol.

## Principles that bind this release

1. No second client, transport loop, retry engine, global transfer registry or public package.
2. No implicit server endpoints, chunk assembly, idempotency or resumability claims.
3. Every initiate/status/part/complete/abort/renew step uses the existing request pipeline,
   transport, middleware, errors, security checks and appropriate validation.
4. Bounded byte buffers and pull-based consumption; metadata growth is explicit and bounded by
   configured protocol limits. A file never becomes one full ArrayBuffer solely for hashing.
5. Local byte observation, server acknowledgment and verified integrity are separate facts.
6. Secrets/signing stay server-side. Presigned cross-origin access requires explicit approved
   policy, isolated credentials and redirect protection; existing calls retain the origin guard.
7. Native `Promise<T>`, preserved response inference and framework-independent Core.
8. Public-contract conflicts require owner review before implementation; recommendations are
   not silent amendments to `docs/architecture.md` or `docs/public-api.md`.

## Intentionally out

RHF/Zod, mandatory cloud SDKs, a universal storage framework, arbitrary stream resume, automatic
browser persistence, background workers, provider account management, download redesign and
unrelated protocols. Broader lifecycle policies, cleanup automation, performance auditing and
production hardening remain v1.8.0, with no folder created here. See [scope.md](./scope.md).
