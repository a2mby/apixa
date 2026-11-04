# v0.13.0 — Zod and runtime schema validation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Define schema attachment to resources and individual operations for request params, query, body, and response.
2. Implement: Allow response and input validation with explicit modes and predictable validation errors.
3. Implement: Infer types from schemas where practical and define how schema inference interacts with defineApi<T>() types.
4. Implement: Provide an optional @apixa/zod adapter; use general schema/validator seams only if independently justified.
5. Implement: Support transforms, coercion, async validation and precise error paths.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No mandatory zod import in Core.
- Do not silently discard unknown fields or automatically validate when not enabled.
