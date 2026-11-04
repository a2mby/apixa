# v0.26.0 — Server-Sent Events and streaming responses

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** Medium. **Source:** Recommended integration.

## Goal

Support one-way realtime events and streamed HTTP responses without forcing WebSockets.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Response streaming transport behavior
- Runtime compatibility

## Open design questions

- SSE protocol parser vs native EventSource adapters.
- Resume/Last-Event-ID and retry semantics.
