# v0.28.0 — Observability, tracing and diagnostics

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Expose request IDs, timings, retry decisions and safe diagnostics.
- Define an opt-in instrumentation adapter for OpenTelemetry or custom telemetry.
- Allow hooks for operation invocation, transport errors and recovery.
- Ensure sensitive headers, tokens and payloads are redacted.
- Document correlation IDs for WebSocket/webhook workflows.

## Out of scope

- No mandatory OpenTelemetry dependency or default logging of secrets.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
