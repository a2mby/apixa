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

| Version    | Status                                               | Path                 |
| ---------- | ---------------------------------------------------- | -------------------- |
| **v0.4.0** | Active — Zustand-style `defineApi<T>()` state typing | [v0.4.0/](./v0.4.0/) |

## Completed

| Version | Status                                 | Path                 |
| ------- | -------------------------------------- | -------------------- |
| v0.3.0  | Shipped — `type<T>()` markers          | [v0.3.0/](./v0.3.0/) |
| v0.2.0  | Shipped — default-first resource CRUD  | [v0.2.0/](./v0.2.0/) |
| v0.1.0  | Shipped — opt-in operations foundation | [v0.1.0/](./v0.1.0/) |

## Later (roadmap only)

Later reliability / ecosystem work is outlined in the roadmap. Create folders when each milestone starts—not before.
