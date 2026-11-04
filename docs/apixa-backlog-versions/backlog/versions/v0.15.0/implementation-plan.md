# v0.15.0 — Unified package and modular installation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Evaluate import { defineApi, defineApis } from "apixa" as stable core exports.
2. Implement: Evaluate feasibility of root useResourceQuery without forcing React into Node-only consumers; prefer optional subpath if required.
3. Implement: Define package exports, conditional exports, ESM/CJS policy, sideEffects and peer dependencies.
4. Implement: Prevent browser bundles from importing server-only code and secrets.
5. Implement: Document migration from @apixa/* packages.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- Do not break framework-agnostic Core or pull optional libraries into installations by default.
