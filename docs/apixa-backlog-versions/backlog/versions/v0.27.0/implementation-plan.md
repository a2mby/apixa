# v0.27.0 — OpenAPI import/export and code generation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Evaluate generating Apixa definitions from OpenAPI operationId/path/schema models.
2. Implement: Evaluate exporting constrained Apixa definitions to OpenAPI with explicit limitations.
3. Implement: Map optional Zod schemas to runtime contract metadata when possible.
4. Implement: Offer deterministic CLI codegen that does not run at app runtime.
5. Implement: Document how customizable operations retain independent endpoint mappings.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No fictional backend methods derived from names alone.
- No mandatory CLI/codegen dependency in Core.
