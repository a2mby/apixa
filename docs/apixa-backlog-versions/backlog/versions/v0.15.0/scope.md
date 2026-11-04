# v0.15.0 — Unified package and modular installation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Evaluate import { defineApi, defineApis } from "apixa" as stable core exports.
- Evaluate feasibility of root useResourceQuery without forcing React into Node-only consumers; prefer optional subpath if required.
- Define package exports, conditional exports, ESM/CJS policy, sideEffects and peer dependencies.
- Prevent browser bundles from importing server-only code and secrets.
- Document migration from @apixa/* packages.

## Out of scope

- Do not break framework-agnostic Core or pull optional libraries into installations by default.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
