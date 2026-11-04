# v0.20.0 — npm publishing, semver and releases

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Verify package.json exports, types, files, peer dependencies, license and engines.
- Adopt versioning and changelog policy for coordinated packages.
- Create build, npm pack, package smoke and npm publish dry-run checks.
- Decide release automation (for example Changesets) and provenance.
- Document release, rollback/deprecation and security response workflows.

## Out of scope

- Do not publish a v1.0.0 before agreed gates pass.
- No automatic package publication from unreviewed changes.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
