# v0.23.0 — WebSockets and bidirectional realtime

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Introduce an optional @apixa/websocket client independent from HTTP CRUD operations.
2. Implement: Model typed incoming/outgoing event messages and subscriptions.
3. Implement: Support connection lifecycle, retry/reconnect, heartbeat and explicit close.
4. Implement: Provide auth refresh and SSR-safe initialization patterns.
5. Implement: Optional bridge to TanStack cache invalidation from received events.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No WebSocket dependency in Core by default.
- No pretend mapping of WebSocket messages to independent HTTP CRUD endpoints.
