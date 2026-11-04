# v0.25.0 — Authentication adapters and credential policies

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Design middleware-friendly bearer token, API key and credential refresh helpers.
- [ ] Prevent concurrent refresh storms and unsafe request replay.
- [ ] Document auth for SSR, cookies/CSRF and browser-safe storage boundaries.
- [ ] Provide platform hooks without holding secrets inside client bundles.
- [ ] Keep Core HTTP transport/auth interfaces generic.
- [ ] Test: Expired credential refresh, concurrent calls, cancellation and failed refresh.
- [ ] Test: Server credentials absent from browser bundle fixtures.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
