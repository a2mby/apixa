# v0.18.0 — Cross-platform and bundler compatibility

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Test Node.js, modern browsers, Next.js client/server, React Native and representative bundlers.
2. Implement: Identify support for Vite, Webpack, Turbopack, Metro and bundler-independent ESM.
3. Implement: Audit global fetch, AbortController, FormData, Blob, WebSocket and platform polyfill needs.
4. Implement: Check SSR boundaries and absence of server secrets in browser bundles.
5. Implement: Publish an explicit runtime support matrix.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No claim of supporting runtimes that lack passing fixtures.
