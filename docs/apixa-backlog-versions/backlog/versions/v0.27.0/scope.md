# v0.27.0 — OpenAPI import/export and code generation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Evaluate generating Apixa definitions from OpenAPI operationId/path/schema models.
- Evaluate exporting constrained Apixa definitions to OpenAPI with explicit limitations.
- Map optional Zod schemas to runtime contract metadata when possible.
- Offer deterministic CLI codegen that does not run at app runtime.
- Document how customizable operations retain independent endpoint mappings.

## Out of scope

- No fictional backend methods derived from names alone.
- No mandatory CLI/codegen dependency in Core.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
