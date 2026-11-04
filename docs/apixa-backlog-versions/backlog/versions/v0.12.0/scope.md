# v0.12.0 — TanStack Query integration hardening

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Expose exactly the operations present on each resource, including readOnly/writeOnly, per-operation false, defaultOperations, operationGroups, and custom operations.
- Preserve inferred argument and result types, with no fake methods added to the returned hook.
- Keep resource-level hooks and per-operation query/mutation state, including the existing users.data and users.isLoading ergonomics.
- Design stable cache-key factories, invalidation strategies, parameterized queries, optimistic-update opt-ins, and infinite/paginated query support.
- Support disabled/conditional queries and cancellation while respecting TanStack Query hook rules.

## Out of scope

- No caching or React dependency in @apixa/core.
- No implicit cross-operation dependency: getMany, exists, findFirst, and others remain independent.
- Do not generate a route the backend does not provide.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
