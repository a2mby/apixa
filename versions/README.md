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

**[v1.0.0](./v1.0.0/)** — in progress. The Query integration workstream is being implemented;
the package has not been released as v1.0.0.

## Completed

| Version | Status                                                                                | Path                   |
| ------- | ------------------------------------------------------------------------------------- | ---------------------- |
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
