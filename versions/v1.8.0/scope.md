# v1.8.0 — Scope

Contract approved at gate G1 and implemented under issue #105 (no commit, push or version change yet). The finding register and decisions are in
[implementation-plan.md](./implementation-plan.md).

## In scope

| Area                      | Included work                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline and probes       | Measure current test/type-consumer counts; reproduce or disprove every register finding with a failing test or measurement; lock decisions H1–H14 (Batch 0).                                                                                                                 |
| Lifecycle (Apixa-owned)   | Replacement, deletion, shared references, orphan detection, temporary/failed-artifact cleanup and idempotent operations for **mock storage** and for Apixa's **own advanced-transfer sessions**. Documented ownership boundary for everything a backend or provider owns.    |
| Atomicity and consistency | Explicit guarantees for managed mock transactions and transfer sessions: partial writes, rollback, concurrent operations, duplicate requests, checkpoint/server divergence, interrupted cleanup, non-rollbackable external effects. Deterministic fault injection per stage. |
| Memory and performance    | Bounded-memory audit of slicing, hashing, multipart serialization, progress wrapping, response buffering, mock storage, query binary caching and checkpoint bookkeeping; deterministic memory/CPU tests with realistic sizes and recorded regression thresholds.             |
| Stream ownership          | Re-audit the v1.6.0 cached-stream limitation: abort, refetch, removal, GC, unmount, reader locks, partial consumption, retry, unhandled errors. Fix proven leaks inside TanStack's ownership model; document the rest.                                                       |
| Security                  | Targeted threat-model tests of real boundaries: size limits (incl. custom transports and non-2xx), filenames/paths, redirects, credentials and headers, presigned policy, checkpoint trust, sanitized errors/logging, mock path isolation, binary serialization.             |
| Transfer reliability      | Races and rare failure combinations in v1.7.0 sessions: concurrent failure, renew/reconcile, abort versus completion, duplicate completion, pause/resume ordering, checkpoint persistence failure, expired sessions/URLs, S3-compatible recovery.                            |
| Error consistency         | One error classification per failure kind across Core, mock, live and the three hooks; no swallowed, double-reported or misleading-success states; typed `ValidationError.violations` and inference preserved.                                                               |
| Mock/live parity          | Verify mock storage represents supported live workflows; document intentional differences; never fabricate advanced-transfer success where mock support is absent.                                                                                                           |
| Runtime compatibility     | Core-only, React 18/19, TanStack, Next SSR/hydration, browser File/Blob, Node 22/24, Vercel Edge, workerd, packed ESM consumers and supported TypeScript configurations; re-confirm v1.6.0 identity/hydration corrections.                                                   |
| API/DX review             | Inventory of redundant options, precedence, naming, undocumented defaults and weak inference. Output is documentation and internal consolidation; API changes only through gate G3.                                                                                          |
| Production guide          | One consolidated task-oriented guide (humans) plus an agent checklist pointer under `docs/guides/`; links to, rather than duplicates, the package READMEs.                                                                                                                   |
| Verification              | Measurable acceptance criteria, fault-injection helpers in `tests/helpers/`, performance thresholds recorded in the acceptance file, full `pnpm verify`, Node 22 and 24 CI.                                                                                                  |

## Affected components

| Component                            | Responsibility during subsequent implementation                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (private)            | Minimal fixes in `mock/files.ts`, `mock/transaction.ts`, `transfer/advanced.ts`, `transfer/checkpoint.ts`, `transport/fetch.ts`, `request/pipeline.ts` only where a finding is confirmed. |
| `packages/mocking` (private)         | Parity checks; changes only for a confirmed mock/live defect.                                                                                                                             |
| `packages/react` (private)           | Stream/cache lifecycle and error-propagation fixes only where proven; identity and hydration corrections stay as shipped.                                                                 |
| `packages/internal/shared` (private) | No planned change.                                                                                                                                                                        |
| `src/` (`apixa`)                     | No planned change; re-exports only if gate G3 approves an addition.                                                                                                                       |
| Root `tests/`, `scripts/`, docs      | Fault-injection and memory tests, packed/runtime scenarios, measurement scripts, production guide.                                                                                        |
| `examples/frontends/query-ssr-next`  | Only if a scenario must demonstrate a fixed lifecycle behavior; other examples are untouched.                                                                                             |

No new workspace or public package and no mandatory runtime dependency. No package-version change.

## Out of scope

| Item                                                                                     | Reason / destination                                                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| React Hook Form, Zod or other framework integrations                                     | Separate optional milestones.                                                          |
| New networking protocols, WebSocket/SSE                                                  | Not file hardening.                                                                    |
| Provider-specific storage frameworks, full S3 SDK, provider account/ACL/IAM management   | Application and backend responsibility; the SDK-free recipe stays the supported shape. |
| Automatic deletion of remote files, TTL/garbage collection of backend storage            | Apixa never owns backend files; the author owns deletion policy (principle 2).         |
| Distributed transactions across backends or providers                                    | Not promisable; guarantees are stated per Apixa-owned scope.                           |
| Range-based download orchestration or resumable downloads                                | Only if an existing correctness defect requires it, with a separate owner decision.    |
| A global stream manager, transfer registry or separate performance framework             | Only if the audit demonstrates a need and the owner approves (G3).                     |
| New public npm packages; a redesigned request pipeline; compatibility-breaking refactors | Unjustified scope expansion.                                                           |
| Stylistic redesign of completed features                                                 | Findings drive changes, not taste.                                                     |
| Version bump, npm publish, release tagging, v1.9.0 or any future folder                  | Release work is separate; no future folders are created.                               |

## Compatibility boundaries

**Owner-approved exception (G2/G3, second pass):** secure-by-default redirect handling is a narrowly scoped breaking security
correction with one optional public property, `redirectOrigins`; nothing else in this section changed.

Public symbols, import paths, hook signatures, error classes and texts, inference and the public
export snapshot stay stable. A confirmed defect whose correct fix changes observable behavior is
recorded as a behavior note in `docs/public-api.md` and submitted at gate G2 before implementation;
a public addition or removal is submitted at gate G3. Existing same-origin protections, the
presigned origin policy, `redirect`/`credentials` isolation for presigned steps and the
consumer-owned stream rule are never loosened silently.
