# v0.21.0 — File uploads and multipart requests

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** High. **Source:** New integration.

## Goal

Support typed upload operations without changing normal JSON requests.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Core request/transport seams
- Cross-platform decisions

## Open design questions

- Whether to add dedicated upload helper or request options.
- Platform-specific progress support (fetch limitations).
