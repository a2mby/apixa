# v0.13.0 — Zod and runtime schema validation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Define schema attachment to resources and individual operations for request params, query, body, and response.
- [ ] Allow response and input validation with explicit modes and predictable validation errors.
- [ ] Infer types from schemas where practical and define how schema inference interacts with defineApi<T>() types.
- [ ] Provide an optional @apixa/zod adapter; use general schema/validator seams only if independently justified.
- [ ] Support transforms, coercion, async validation and precise error paths.
- [ ] Test: Valid/invalid request and response schemas, transformed values, custom operations.
- [ ] Test: Type inference and no-Zod core consumer build.
- [ ] Test: Zero behavior change with schemas omitted.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
