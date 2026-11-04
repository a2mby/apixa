# v0.18.0 — Cross-platform and bundler compatibility

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Test Node.js, modern browsers, Next.js client/server, React Native and representative bundlers.
- Identify support for Vite, Webpack, Turbopack, Metro and bundler-independent ESM.
- Audit global fetch, AbortController, FormData, Blob, WebSocket and platform polyfill needs.
- Check SSR boundaries and absence of server secrets in browser bundles.
- Publish an explicit runtime support matrix.

## Out of scope

- No claim of supporting runtimes that lack passing fixtures.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
