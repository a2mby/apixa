# v0.24.0 — Outgoing and incoming webhooks

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Provide optional server-only utilities to sign/verify webhook payloads.
2. Implement: Define timestamps, replay window, idempotency keys and redelivery behavior.
3. Implement: Document outgoing delivery retries, backoff and dead-letter strategy.
4. Implement: Support provider-specific signing algorithms via adapters.
5. Implement: Supply examples for Next.js/Node handlers and typed events.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No client/browser secret keys.
- No automatic global webhook receiver; receiving needs a hosted server endpoint.
