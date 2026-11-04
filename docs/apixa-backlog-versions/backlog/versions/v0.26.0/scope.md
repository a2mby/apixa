# v0.26.0 — Server-Sent Events and streaming responses

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Expose typed SSE event consumption with cancellation and reconnect rules.
- Support line-delimited JSON and streaming response readers where appropriate.
- Handle incremental parsing, backpressure, timeouts and graceful closure.
- Provide optional TanStack invalidation/update hooks from event streams.
- Describe platform requirements and SSR-safe usage.

## Out of scope

- No conflation of SSE with WebSocket bidirectional messaging.
- No global streaming state manager in Core.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
