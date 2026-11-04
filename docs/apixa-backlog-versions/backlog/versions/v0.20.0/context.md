# v0.20.0 — npm publishing, semver and releases

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** High. **Source:** Existing backlog.

## Goal

Ship installable artifacts safely with traceable versions.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Public API
- Testing/CI
- Cross-platform compatibility
- Docs

## Open design questions

- Independent vs fixed package versions.
- Release channels, tags and semver thresholds.
