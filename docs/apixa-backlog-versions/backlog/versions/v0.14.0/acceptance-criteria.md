# v0.14.0 — React Hook Form integration

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Provide an optional integration package or recipes for useForm and Apixa resource mutations.
- [ ] Map mutation loading, success, server field errors and general errors to form UX.
- [ ] Optionally compose with @apixa/zod resolvers, without requiring Zod.
- [ ] Support create, update, patch, and custom operations when present; form reset and invalidation are explicit.
- [ ] Keep composable submit handlers rather than a second form state machine.
- [ ] Test: Form submit/reset, validation failures, pending states and server errors.
- [ ] Test: Disabled resource mutation is absent from types.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
