# v0.12.0 — TanStack Query integration hardening

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Expose exactly the operations present on each resource, including readOnly/writeOnly, per-operation false, defaultOperations, operationGroups, and custom operations.
2. Implement: Preserve inferred argument and result types, with no fake methods added to the returned hook.
3. Implement: Keep resource-level hooks and per-operation query/mutation state, including the existing users.data and users.isLoading ergonomics.
4. Implement: Design stable cache-key factories, invalidation strategies, parameterized queries, optimistic-update opt-ins, and infinite/paginated query support.
5. Implement: Support disabled/conditional queries and cancellation while respecting TanStack Query hook rules.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No caching or React dependency in @apixa/core.
- No implicit cross-operation dependency: getMany, exists, findFirst, and others remain independent.
- Do not generate a route the backend does not provide.
