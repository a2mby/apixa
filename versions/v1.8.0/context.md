# v1.8.0 — Context

Frozen milestone context. Living direction: [`docs/context.md`](../../docs/context.md).

## Goal

Make the file-handling subsystem delivered across v1.1.0–v1.7.0 trustworthy for production by
auditing it end to end and fixing only what the audit proves: lifecycle and atomicity gaps,
security boundaries, unbounded memory or CPU, stream and resource ownership, transfer-session
races, error consistency, mock/live parity and cross-runtime behavior. Then consolidate the
guarantees and limits into one production guide.

> Common workflows should work without configuration; unusual backend requirements should remain configurable.

This is a **hardening** milestone. It adds no feature family. Any public API addition, removal or
breaking behavior change needs a concrete finding and an explicit owner decision (gate G3).

**Status: implemented and locally verified (issue #105); G1 approved, owner sign-off pending.** The
finding register in [implementation-plan.md](./implementation-plan.md) began as a static audit; its
final dispositions, measurements and three open owner decisions are recorded there and in acceptance criteria.

## Identity (this release)

- Advanced File Handling, phase 9 of 9 (the final phase): **File Lifecycle, Performance &
  Production Hardening**.
- One published `apixa` package; manifest remains `1.0.0-rc.0`. Starting this milestone neither
  publishes, bumps a version nor declares v1.0.0 stable.
- Private modules unchanged: `packages/core`, `packages/mocking`, `packages/react`,
  `packages/internal/shared`; `src/` is a re-export-only facade. Core stays framework independent.
- Audit baseline: `main` at `03fde16` (v1.7.0 squash of PR #104; issue #103 closed; CI
  `verify (22)`/`verify (24)` green on its head). v1.7.0 owner sign-off was recorded 2026-11-11.
  Earlier open owner sign-offs (v1.1.0–v1.4.0, v1.6.0) are **not** granted by this kickoff.

## Inherited behavior this milestone must preserve

- v1.1.0–v1.2.0: typed file fields, multipart only when binary values are present, binary
  responses; v1.3.0: `onTransfer`, pull-based streams, call-owned stream lifetime; v1.4.0: opt-in
  validation and bounded response reads; v1.5.0: managed mock storage and reference ownership;
  v1.6.0: binary query-identity rejection, combined signals, binary/stream omission from
  dehydration, consumer-owned cached streams; v1.7.0: explicit chunked/resumable sessions,
  caller-owned checkpoints, SHA-256 identity, presigned isolation, `createTransferControl`.
- Existing error classes and texts, hook signatures, `Promise<T>` results and the generated public
  export snapshot stay stable unless gate G3 approves a change.
- Historical test counts (v1.7.0: 1,451 tests / 138 files; 62/62 packed type consumers) are
  reference values only. The current counts are measured in Batch 0 and recorded.

## What success looks like

1. Every finding in the register is classified (confirmed defect, known limitation, speculative
   risk, non-issue) with evidence; every confirmed P0/P1 has a failing regression test first, a
   minimal fix and a recorded compatibility impact.
2. The documented guarantees are explicit and tested: what Apixa owns (client-side mock storage,
   its own transfer sessions, its own streams), what a backend or storage provider owns, and what
   cannot be made atomic across independent systems.
3. Memory and CPU are bounded by configuration, not file size, on every file path that claims it,
   with deterministic measurements and regression thresholds rather than performance claims.
4. Security boundaries are exercised, not just configured: size limits, origin and redirect
   policy, credential isolation, checkpoint trust, sanitized errors, mock path isolation.
5. One consolidated production guide states guarantees, backend responsibilities, limits and
   recovery, without duplicating the package READMEs.
6. The full `pnpm verify` gate and CI Node 22 and 24 pass; no known unaddressed critical defect
   remains, and every remaining limitation is documented.

## Principles that bind this release

1. Fix proven defects; do not redesign completed features for style. Documentation and internal
   consolidation are preferred over new APIs.
2. Never delete or mutate remote files merely because a frontend record changed. Apixa manages only
   what it owns (its in-memory mock storage and its own transfer sessions); the author owns business
   deletion and replacement policy.
3. No distributed-transaction promises across independent backends or storage providers.
4. Resumability still requires backend support; presigned destinations still require the explicit
   origin policy; same-origin protections are never silently loosened.
5. No new transfer hook, global stream manager, progress registry, networking client, protocol
   framework, performance framework or mandatory dependency without demonstrated need and owner approval.
6. Regression test before fix. Measured baselines before any performance change.
7. Framework-independent Core; React, TanStack, Next and Edge compatibility preserved.

## Intentionally out

React Hook Form and Zod integrations, new networking protocols, WebSocket/SSE, provider-specific
storage frameworks, a full S3 SDK, range-based download orchestration (unless an existing
correctness defect needs it), new public npm packages, a redesigned request pipeline and
unnecessary compatibility-breaking refactors. See [scope.md](./scope.md).
