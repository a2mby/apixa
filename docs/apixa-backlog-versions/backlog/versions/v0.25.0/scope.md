# v0.25.0 — Authentication adapters and credential policies

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Design middleware-friendly bearer token, API key and credential refresh helpers.
- Prevent concurrent refresh storms and unsafe request replay.
- Document auth for SSR, cookies/CSRF and browser-safe storage boundaries.
- Provide platform hooks without holding secrets inside client bundles.
- Keep Core HTTP transport/auth interfaces generic.

## Out of scope

- No built-in identity provider, user database or authentication server.
- No server secrets embedded in universal clients.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
