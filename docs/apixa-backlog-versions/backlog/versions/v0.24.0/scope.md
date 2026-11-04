# v0.24.0 — Outgoing and incoming webhooks

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Provide optional server-only utilities to sign/verify webhook payloads.
- Define timestamps, replay window, idempotency keys and redelivery behavior.
- Document outgoing delivery retries, backoff and dead-letter strategy.
- Support provider-specific signing algorithms via adapters.
- Supply examples for Next.js/Node handlers and typed events.

## Out of scope

- No client/browser secret keys.
- No automatic global webhook receiver; receiving needs a hosted server endpoint.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
