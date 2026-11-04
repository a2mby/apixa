# v0.19.0 — Documentation, examples and migration guides

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Rewrite README to reflect implemented API, not historical versions.
2. Implement: Document defineApi/defineApis operation selection, custom functions, errors, retries, mocking and TanStack hooks.
3. Implement: Create realistic examples for Node, React/Next and optional integrations.
4. Implement: Add migration guides from older APIs and known gotchas.
5. Implement: Add generated or curated public API reference, with runnable snippets.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- Do not present proposed backlog features as released.
