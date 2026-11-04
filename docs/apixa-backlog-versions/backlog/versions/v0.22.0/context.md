# v0.22.0 — File downloads and binary responses

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** High. **Source:** New integration.

## Goal

Provide reliable typed download and binary response flows.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Core responseType support
- Cross-platform runtime matrix

## Open design questions

- Response body versus full response return API.
- Content-disposition handling and streaming portability.
