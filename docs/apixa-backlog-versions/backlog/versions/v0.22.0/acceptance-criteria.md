# v0.22.0 — File downloads and binary responses

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Support arrayBuffer/blob/stream response handling and content disposition metadata.
- [ ] Expose explicit options for downloadable files through standard operations.
- [ ] Make large-download streaming and cancellation available where supported.
- [ ] Preserve HTTP and parsing error semantics for binary responses.
- [ ] Provide client and Node save-to-file recipes without mandatory filesystem APIs.
- [ ] Test: Binary byte equality, content type and filename handling.
- [ ] Test: Large streaming response and cancellation.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
