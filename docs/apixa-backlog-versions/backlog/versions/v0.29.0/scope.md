# v0.29.0 — Performance benchmarks and optimization gates

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Measure published package and treeshaken bundle size.
- Benchmark initialization and request overhead, with and without middleware.
- Measure TS typecheck latency in large resource declarations.
- Measure mocking memory/lookup and TanStack hook memory/subscribe costs.
- Track regressions on repeatable fixtures and optimize confirmed bottlenecks only.

## Out of scope

- No premature speculative rewrites.
- No comparing apples to oranges between warm and cold runs.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
