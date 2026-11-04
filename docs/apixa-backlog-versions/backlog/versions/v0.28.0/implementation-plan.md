# v0.28.0 — Observability, tracing and diagnostics

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Phase 1 — Design and audit

1. Inspect the repository after the A–F changes land, including current exports, tests and package structure.
2. Decide the open design questions in `context.md`, recording trade-offs and rejected approaches.
3. Write minimal consumer-first TypeScript usage examples and ensure they preserve existing ergonomics.

## Phase 2 — Smallest implementation

1. Implement: Expose request IDs, timings, retry decisions and safe diagnostics.
2. Implement: Define an opt-in instrumentation adapter for OpenTelemetry or custom telemetry.
3. Implement: Allow hooks for operation invocation, transport errors and recovery.
4. Implement: Ensure sensitive headers, tokens and payloads are redacted.
5. Implement: Document correlation IDs for WebSocket/webhook workflows.

## Phase 3 — Verification

1. Add focused type-level and runtime regression tests for this feature.
2. Run clean installs/builds and test the **compiled distribution** where a package is affected.
3. Verify zero regression in Core, Mocking and optional TanStack behavior.
4. Update examples, migration notes and changelog.
5. Obtain explicit approval before promoting this backlog item to `versions/`.

## Constraints

- No mandatory OpenTelemetry dependency or default logging of secrets.
