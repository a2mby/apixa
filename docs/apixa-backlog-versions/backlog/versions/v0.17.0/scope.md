# v0.17.0 — Testing and CI hardening

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Build CI jobs for typecheck, unit/integration tests, lint and package builds.
- Create clean-clone, lockfile reproducibility and pnpm workspace checks.
- Test compiled dist and pack/install tarballs in isolated fixture projects.
- Add regression matrix for operation selection, independent builtins, errors, mocking and TanStack integration.
- Introduce coverage baselines and release gate checks.

## Out of scope

- No CI checks that depend on hidden local path aliases or unpublished files.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
