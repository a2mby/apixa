# v0.12.0 — TanStack Query integration hardening

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Expose exactly the operations present on each resource, including readOnly/writeOnly, per-operation false, defaultOperations, operationGroups, and custom operations.
- [ ] Preserve inferred argument and result types, with no fake methods added to the returned hook.
- [ ] Keep resource-level hooks and per-operation query/mutation state, including the existing users.data and users.isLoading ergonomics.
- [ ] Design stable cache-key factories, invalidation strategies, parameterized queries, optimistic-update opt-ins, and infinite/paginated query support.
- [ ] Support disabled/conditional queries and cancellation while respecting TanStack Query hook rules.
- [ ] Test: Compile-time negative and positive inference tests for disabled and custom methods.
- [ ] Test: React-hook tests for cache invalidation, errors, params, cancellation and pagination.
- [ ] Test: Integration tests against compiled dist exports.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
