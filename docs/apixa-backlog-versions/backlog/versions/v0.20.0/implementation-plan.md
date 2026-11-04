# v0.20.0 — npm publishing, semver and releases

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Verify package.json exports, types, files, peer dependencies, license and engines.
2. Implement: Adopt versioning and changelog policy for coordinated packages.
3. Implement: Create build, npm pack, package smoke and npm publish dry-run checks.
4. Implement: Decide release automation (for example Changesets) and provenance.
5. Implement: Document release, rollback/deprecation and security response workflows.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- Do not publish a v1.0.0 before agreed gates pass.
- No automatic package publication from unreviewed changes.
