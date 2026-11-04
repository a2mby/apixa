# v0.24.0 — Outgoing and incoming webhooks

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** Medium. **Source:** New integration.

## Goal

Support server-side webhook delivery and verified consumption, distinctly from WebSockets.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Server/runtime boundary design
- Public error contracts

## Open design questions

- Canonical body verification rules (raw body).
- Signature format, key rotation and idempotency storage boundary.
