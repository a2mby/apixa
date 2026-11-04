# v0.22.0 — File downloads and binary responses

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Support arrayBuffer/blob/stream response handling and content disposition metadata.
2. Implement: Expose explicit options for downloadable files through standard operations.
3. Implement: Make large-download streaming and cancellation available where supported.
4. Implement: Preserve HTTP and parsing error semantics for binary responses.
5. Implement: Provide client and Node save-to-file recipes without mandatory filesystem APIs.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No writing directly to filesystem from universal Core.
