# v0.18.0 — Cross-platform and bundler compatibility

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Test Node.js, modern browsers, Next.js client/server, React Native and representative bundlers.
- [ ] Identify support for Vite, Webpack, Turbopack, Metro and bundler-independent ESM.
- [ ] Audit global fetch, AbortController, FormData, Blob, WebSocket and platform polyfill needs.
- [ ] Check SSR boundaries and absence of server secrets in browser bundles.
- [ ] Publish an explicit runtime support matrix.
- [ ] Test: Build/run smoke fixture for each supported environment.
- [ ] Test: Run negative tests for server-only imports in browser bundles.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
