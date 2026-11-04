# v0.27.0 — OpenAPI import/export and code generation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Evaluate generating Apixa definitions from OpenAPI operationId/path/schema models.
- [ ] Evaluate exporting constrained Apixa definitions to OpenAPI with explicit limitations.
- [ ] Map optional Zod schemas to runtime contract metadata when possible.
- [ ] Offer deterministic CLI codegen that does not run at app runtime.
- [ ] Document how customizable operations retain independent endpoint mappings.
- [ ] Test: Stable generation snapshots and typed generated sample.
- [ ] Test: Unsupported spec constructs produce explicit warnings.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
