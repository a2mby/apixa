# v0.22.0 — File downloads and binary responses

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Support arrayBuffer/blob/stream response handling and content disposition metadata.
- Expose explicit options for downloadable files through standard operations.
- Make large-download streaming and cancellation available where supported.
- Preserve HTTP and parsing error semantics for binary responses.
- Provide client and Node save-to-file recipes without mandatory filesystem APIs.

## Out of scope

- No writing directly to filesystem from universal Core.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
