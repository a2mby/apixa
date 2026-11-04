# v0.15.0 — Unified package and modular installation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Evaluate import { defineApi, defineApis } from "apixa" as stable core exports.
- [ ] Evaluate feasibility of root useResourceQuery without forcing React into Node-only consumers; prefer optional subpath if required.
- [ ] Define package exports, conditional exports, ESM/CJS policy, sideEffects and peer dependencies.
- [ ] Prevent browser bundles from importing server-only code and secrets.
- [ ] Document migration from @apixa/* packages.
- [ ] Test: Node core-only import without installed React.
- [ ] Test: Tree-shaking and bundler smoke tests using published tarballs.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
