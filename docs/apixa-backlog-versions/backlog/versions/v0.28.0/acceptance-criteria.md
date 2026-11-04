# v0.28.0 — Observability, tracing and diagnostics

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Expose request IDs, timings, retry decisions and safe diagnostics.
- [ ] Define an opt-in instrumentation adapter for OpenTelemetry or custom telemetry.
- [ ] Allow hooks for operation invocation, transport errors and recovery.
- [ ] Ensure sensitive headers, tokens and payloads are redacted.
- [ ] Document correlation IDs for WebSocket/webhook workflows.
- [ ] Test: Instrumentation is off by default and cannot affect requests.
- [ ] Test: Credentials and sensitive payloads redacted.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
