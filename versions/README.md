# Versions

Each folder under `versions/` freezes the coding contract for one milestone.

## How it works

1. Living direction lives in [`docs/`](../docs/) (`context`, `architecture`, `roadmap`, `conventions`, ADRs).
2. When a milestone starts, create `versions/vX.Y.Z/` with the four files below.
3. Implement against that folder until acceptance criteria pass.
4. Do **not** create empty future version folders. Describe later work in [`docs/roadmap.md`](../docs/roadmap.md) until that milestone begins.

## Required files per version

| File                     | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `context.md`             | Frozen subset of project context for this release |
| `scope.md`               | Explicit in / out                                 |
| `implementation-plan.md` | Ordered smallest-path plan                        |
| `acceptance-criteria.md` | Checklist that gates “done”                       |

## Current

**[v1.7.0](./v1.7.0/)** — Large Files & Advanced Transfers (Advanced File Handling, phase 8).
Implemented and verified under issue #103 (PR #104, CI Node 22/24 green); precise API owner-approved 2026-11-10, owner sign-off recorded 2026-11-11. Explicit optional chunk/session
strategies through existing operations and request infrastructure, protocol-supported resumability,
bounded parallelism, checkpoints, safe retries, integrity and presigned security. S3-compatible
recipe and download audit included; public adapter/range extensions require recorded decisions.
D1–D18 were resolved by explicit owner approval before production implementation; no npm release.

Previous: **[v1.6.0](./v1.6.0/)** — Advanced Framework & Consumer Integration (phase 7).
Implemented, verified (`pnpm verify`) and merged (PR #102); owner sign-off remains open. Packed
React 18/19 runtime coverage and tracked Next `/files` now supply the later evidence for earlier
coverage gaps. The frozen final CI checkbox remains unchecked; no shipped status is inferred.

Previous: **[v1.5.0](./v1.5.0/)** — Advanced Mock File Storage (phase 6). Completed and verified
(`pnpm verify`); owner sign-off recorded 2026-11-09.

Earlier: **[v1.4.0](./v1.4.0/)** — File Validation, Middleware & Safety (phase 5).
Merged and verified (`pnpm verify`); **owner sign-off remains open**. Its frozen coverage
checkboxes remain unchanged; v1.6.0 supplies later React 18 runtime and tracked Next/browser evidence.
Not declared shipped.

Earlier: **[v1.3.0](./v1.3.0/)** — File Transfer Progress, Streaming & Reliability (phase 4). Merged
to `main`; **owner sign-off is still open**.

Earlier: **[v1.2.0](./v1.2.0/)** — File Downloads & Binary Responses (phase 3). Merged to `main`;
**owner sign-off is still open**.

Earlier: **[v1.1.0](./v1.1.0/)** — Advanced File Handling, phase 1 (file fields, multipart, mock
file store). Merged to `main`; **owner sign-off is still open**.

Earlier: **[v1.0.0](./v1.0.0/)** — release candidate only (`apixa@1.0.0-rc.0` is published; v1.0.0
is **not** declared stable). Its folder stays as the contract for that line.

## Completed

| Version | Status                                                                                | Path                   |
| ------- | ------------------------------------------------------------------------------------- | ---------------------- |
| v1.5.0  | Completed and owner-approved — Advanced Mock File Storage; no npm release             | [v1.5.0/](./v1.5.0/)   |
| v0.11.0 | Shipped — Harden v0.10.0 (`ParseError`, single retry decision, `useResourceMutation`) | [v0.11.0/](./v0.11.0/) |
| v0.10.0 | Shipped — Fully customizable resource operations, plus 11 always-on builtins          | [v0.10.0/](./v0.10.0/) |
| v0.9.0  | Shipped — Flatten Core mock syntax (`mock: "<dataset-id>"`)                           | [v0.9.0/](./v0.9.0/)   |
| v0.8.0  | Shipped — Unified TanStack Query resource integration (`useResourceQuery`)            | [v0.8.0/](./v0.8.0/)   |
| v0.7.0  | Shipped — Thin Core + plugin seams (types, middleware, errors)                        | [v0.7.0/](./v0.7.0/)   |
| v0.6.0  | Shipped — Core request reliability (abort, retries, thin middleware)                  | [v0.6.0/](./v0.6.0/)   |
| v0.5.0  | Shipped — Simple Mocking + local datasets + remove backend                            | [v0.5.0/](./v0.5.0/)   |
| v0.4.0  | Shipped — entity-only `defineApi<T>()` state typing                                   | [v0.4.0/](./v0.4.0/)   |
| v0.3.0  | Shipped — `type<T>()` markers (removed in v0.4.0)                                     | [v0.3.0/](./v0.3.0/)   |
| v0.2.0  | Shipped — default-first resource CRUD                                                 | [v0.2.0/](./v0.2.0/)   |
| v0.1.0  | Shipped — opt-in operations foundation                                                | [v0.1.0/](./v0.1.0/)   |

## Later (roadmap only)

Schema hooks, env packages, and remaining integrations stay in [`docs/roadmap.md`](../docs/roadmap.md) until each milestone starts.
