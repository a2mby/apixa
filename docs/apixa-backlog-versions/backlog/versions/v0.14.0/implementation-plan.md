# v0.14.0 — React Hook Form integration

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Provide an optional integration package or recipes for useForm and Apixa resource mutations.
2. Implement: Map mutation loading, success, server field errors and general errors to form UX.
3. Implement: Optionally compose with @apixa/zod resolvers, without requiring Zod.
4. Implement: Support create, update, patch, and custom operations when present; form reset and invalidation are explicit.
5. Implement: Keep composable submit handlers rather than a second form state machine.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No React Hook Form dependency in Core or mandatory root import.
- No duplicate implementation of React Hook Form validation and state.
