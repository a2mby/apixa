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

**[v1.8.1](./v1.8.1/)** — Laravel Real-World Backend Playground. Environment-only implementation under issue #107: independent Composer/Laravel project, native PostgreSQL, MongoDB documents, empty API routing, CORS, storage and isolated test/E2E/production configuration. No SDK/package-version change or npm release. HTTP manual-test cases stay blocked until the author adds application endpoints.

## Milestone status

A merged milestone is not an npm release. "Owner sign-off" is recorded only when the owner states it;
an unchecked frozen box is not inferred as passed.

| Version | Status                                                                                | Topic                                                |
| ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| v1.8.1  | Active — environment verified locally; PR CI and owner sign-off remain delivery gates | Laravel/PostgreSQL/MongoDB playground                |
| v1.8.0  | Merged as PR #106 (`b0cf6b4`); CI Node 22/24 green; owner final sign-off not inferred | File lifecycle, performance and production hardening |
| v1.7.0  | Completed, verified, merged as PR #104; owner-signed-off 2026-11-11                   | Large files and advanced transfers                   |
| v1.6.0  | Implemented and verified; merged as PR #102; owner sign-off open                      | Advanced framework and consumer integration          |
| v1.5.0  | Completed and verified (`pnpm verify`); owner-signed-off 2026-11-09                   | Advanced mock file storage                           |
| v1.4.0  | Merged and verified; owner sign-off open                                              | File validation, middleware and safety               |
| v1.3.0  | Merged; owner sign-off open                                                           | Transfer progress, streaming and reliability         |
| v1.2.0  | Merged; owner sign-off open                                                           | Downloads and binary responses                       |
| v1.1.0  | Implemented, verified and merged; owner sign-off open                                 | Advanced file handling, phase 1                      |
| v1.0.0  | Release candidate only — `apixa@1.0.0-rc.0` is published; stable `1.0.0` not declared | Query/mutation DX and single-package distribution    |
| v0.11.0 | Shipped — `ParseError`, single retry decision, `useResourceMutation`                  | Harden v0.10.0                                       |
| v0.10.0 | Shipped — fully customizable operations, sixteen builtins                             | Operation customization                              |
| v0.9.0  | Shipped — flat resource mock configuration                                            | Mock syntax                                          |
| v0.8.0  | Shipped — unified TanStack Query resource integration                                 | React integration                                    |
| v0.7.0  | Shipped — thin Core, plugin seams, raw bodies and retry hooks                         | Core seams                                           |
| v0.6.0  | Shipped — abort, retries, timeouts, thin middleware                                   | Reliability                                          |
| v0.5.0  | Shipped — local datasets and `@apixa/mocking`; backend removed                        | Mocking foundation                                   |
| v0.4.0  | Shipped — entity-only `defineApi<T>()` state typing                                   | State typing                                         |
| v0.3.0  | Shipped — `type<T>()` markers (removed in v0.4.0)                                     | Historical typing                                    |
| v0.2.0  | Shipped — default-first resource CRUD                                                 | Default operations                                   |
| v0.1.0  | Shipped — opt-in operations foundation                                                | Foundation                                           |

## Later (roadmap only)

Schema hooks, Vue/Angular adapters, authenticated/provider storage, ranged downloads, OpenAPI and
other future work stay in [`docs/roadmap.md`](../docs/roadmap.md) until each milestone starts.
Do not create those folders in advance.
