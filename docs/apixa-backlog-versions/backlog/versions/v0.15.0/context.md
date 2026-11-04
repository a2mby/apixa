# v0.15.0 — Unified package and modular installation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** High. **Source:** Existing backlog.

## Goal

Enable a pleasant apixa import surface while preserving modular, tree-shakable dependencies.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Public API selection
- Validation of bundler and runtime behavior

## Open design questions

- Root named React exports vs apixa/react, apixa/tanstack-query subpaths.
- One facade package vs compatibility reexports.
- Supported module formats and minimum engines.
