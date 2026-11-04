# v0.21.0 — File uploads and multipart requests

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Support File/Blob/Buffer-equivalent and multipart FormData where platform permits.
- Define explicit request body modes and content-type boundary ownership.
- Provide progress/cancellation adapters only where runtime supports them.
- Allow custom operation upload endpoints and large-file streaming adapters.
- Document filename, limits, validation and safe retry defaults.

## Out of scope

- No assumption every backend accepts upload routes.
- No default retry of non-replayable upload bodies.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
