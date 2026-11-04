# v0.21.0 — File uploads and multipart requests

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Support File/Blob/Buffer-equivalent and multipart FormData where platform permits.
2. Implement: Define explicit request body modes and content-type boundary ownership.
3. Implement: Provide progress/cancellation adapters only where runtime supports them.
4. Implement: Allow custom operation upload endpoints and large-file streaming adapters.
5. Implement: Document filename, limits, validation and safe retry defaults.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No assumption every backend accepts upload routes.
- No default retry of non-replayable upload bodies.
