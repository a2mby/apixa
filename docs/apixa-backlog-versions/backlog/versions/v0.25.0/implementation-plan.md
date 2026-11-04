# v0.25.0 — Authentication adapters and credential policies

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Design middleware-friendly bearer token, API key and credential refresh helpers.
2. Implement: Prevent concurrent refresh storms and unsafe request replay.
3. Implement: Document auth for SSR, cookies/CSRF and browser-safe storage boundaries.
4. Implement: Provide platform hooks without holding secrets inside client bundles.
5. Implement: Keep Core HTTP transport/auth interfaces generic.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No built-in identity provider, user database or authentication server.
- No server secrets embedded in universal clients.
