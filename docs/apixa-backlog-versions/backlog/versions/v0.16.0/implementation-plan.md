# v0.16.0 — Public API cleanup and entrypoints

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Inventory all current exports from Core, Mocking and TanStack packages.
2. Implement: Remove or hide internal implementation utilities; explicitly mark unstable/advanced subpaths.
3. Implement: Specify name, type and error compatibility and migration policy.
4. Implement: Audit TypeScript declaration maps, exports maps and docs consistency.
5. Implement: Define deprecation guidelines without changing operation semantics silently.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No unrelated refactor of runtime behavior.
- No unreviewed breaking changes.
