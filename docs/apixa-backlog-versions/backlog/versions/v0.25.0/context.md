# v0.25.0 — Authentication adapters and credential policies

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** Medium. **Source:** Recommended integration.

## Goal

Provide opt-in secure ways to supply credentials across browser and server.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Core middleware/transport
- Cross-platform boundaries

## Open design questions

- Token provider contract and refresh retry policy.
- Auth errors and logout/expiry handling.
