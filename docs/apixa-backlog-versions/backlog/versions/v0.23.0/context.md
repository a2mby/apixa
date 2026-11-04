# v0.23.0 — WebSockets and bidirectional realtime

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** Medium. **Source:** New integration.

## Goal

Add typed bidirectional realtime clients as an optional protocol layer.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Core shared error/type conventions
- TanStack integration for optional cache bridge

## Open design questions

- Event schema conventions and message codec.
- Reconnect, backoff, ordering and at-most/at-least-once handling.
