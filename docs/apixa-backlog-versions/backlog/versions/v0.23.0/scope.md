# v0.23.0 — WebSockets and bidirectional realtime

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Introduce an optional @apixa/websocket client independent from HTTP CRUD operations.
- Model typed incoming/outgoing event messages and subscriptions.
- Support connection lifecycle, retry/reconnect, heartbeat and explicit close.
- Provide auth refresh and SSR-safe initialization patterns.
- Optional bridge to TanStack cache invalidation from received events.

## Out of scope

- No WebSocket dependency in Core by default.
- No pretend mapping of WebSocket messages to independent HTTP CRUD endpoints.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
