# v0.13.0 — Zod and runtime schema validation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Define schema attachment to resources and individual operations for request params, query, body, and response.
- Allow response and input validation with explicit modes and predictable validation errors.
- Infer types from schemas where practical and define how schema inference interacts with defineApi<T>() types.
- Provide an optional @apixa/zod adapter; use general schema/validator seams only if independently justified.
- Support transforms, coercion, async validation and precise error paths.

## Out of scope

- No mandatory zod import in Core.
- Do not silently discard unknown fields or automatically validate when not enabled.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
