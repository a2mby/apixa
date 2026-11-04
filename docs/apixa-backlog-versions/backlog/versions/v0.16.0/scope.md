# v0.16.0 — Public API cleanup and entrypoints

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Inventory all current exports from Core, Mocking and TanStack packages.
- Remove or hide internal implementation utilities; explicitly mark unstable/advanced subpaths.
- Specify name, type and error compatibility and migration policy.
- Audit TypeScript declaration maps, exports maps and docs consistency.
- Define deprecation guidelines without changing operation semantics silently.

## Out of scope

- No unrelated refactor of runtime behavior.
- No unreviewed breaking changes.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
