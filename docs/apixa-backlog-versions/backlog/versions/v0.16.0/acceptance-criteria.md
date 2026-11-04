# v0.16.0 — Public API cleanup and entrypoints

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Inventory all current exports from Core, Mocking and TanStack packages.
- [ ] Remove or hide internal implementation utilities; explicitly mark unstable/advanced subpaths.
- [ ] Specify name, type and error compatibility and migration policy.
- [ ] Audit TypeScript declaration maps, exports maps and docs consistency.
- [ ] Define deprecation guidelines without changing operation semantics silently.
- [ ] Test: Import-only public API tests from built tarballs.
- [ ] Test: Compile-time tests that internal paths are inaccessible.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
