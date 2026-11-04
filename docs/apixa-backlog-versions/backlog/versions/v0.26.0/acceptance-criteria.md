# v0.26.0 — Server-Sent Events and streaming responses

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Expose typed SSE event consumption with cancellation and reconnect rules.
- [ ] Support line-delimited JSON and streaming response readers where appropriate.
- [ ] Handle incremental parsing, backpressure, timeouts and graceful closure.
- [ ] Provide optional TanStack invalidation/update hooks from event streams.
- [ ] Describe platform requirements and SSR-safe usage.
- [ ] Test: Chunk boundary parsing and malformed payloads.
- [ ] Test: Reconnect, abort, cleanup and backpressure.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
