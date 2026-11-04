# v0.16.0 — Public API cleanup and entrypoints

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** High. **Source:** Existing backlog.

## Goal

Freeze the consumer-facing contracts before publishing stable packages.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- A–F core spec
- Unified package design

## Open design questions

- Export allowlist and compat aliases.
- Which advanced APIs receive support guarantees.
