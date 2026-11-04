# v0.29.0 — Performance benchmarks and optimization gates

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Measure published package and treeshaken bundle size.
- [ ] Benchmark initialization and request overhead, with and without middleware.
- [ ] Measure TS typecheck latency in large resource declarations.
- [ ] Measure mocking memory/lookup and TanStack hook memory/subscribe costs.
- [ ] Track regressions on repeatable fixtures and optimize confirmed bottlenecks only.
- [ ] Test: Reproducible documented benchmark script.
- [ ] Test: Report includes methodology, baseline and variance.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
