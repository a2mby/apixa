# v0.23.0 — WebSockets and bidirectional realtime

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Introduce an optional @apixa/websocket client independent from HTTP CRUD operations.
- [ ] Model typed incoming/outgoing event messages and subscriptions.
- [ ] Support connection lifecycle, retry/reconnect, heartbeat and explicit close.
- [ ] Provide auth refresh and SSR-safe initialization patterns.
- [ ] Optional bridge to TanStack cache invalidation from received events.
- [ ] Test: Connect/reconnect, unsubscribe cleanup, malformed events and auth refresh.
- [ ] Test: No socket created during SSR import.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
