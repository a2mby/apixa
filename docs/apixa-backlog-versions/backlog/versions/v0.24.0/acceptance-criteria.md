# v0.24.0 — Outgoing and incoming webhooks

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Provide optional server-only utilities to sign/verify webhook payloads.
- [ ] Define timestamps, replay window, idempotency keys and redelivery behavior.
- [ ] Document outgoing delivery retries, backoff and dead-letter strategy.
- [ ] Support provider-specific signing algorithms via adapters.
- [ ] Supply examples for Next.js/Node handlers and typed events.
- [ ] Test: Valid/tampered signatures and replay protection.
- [ ] Test: Duplicate delivery, timeout and retry safety.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
