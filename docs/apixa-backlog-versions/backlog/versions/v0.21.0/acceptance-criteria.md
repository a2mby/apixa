# v0.21.0 — File uploads and multipart requests

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Acceptance criteria

- [ ] Scope and design questions are explicitly approved.
- [ ] Support File/Blob/Buffer-equivalent and multipart FormData where platform permits.
- [ ] Define explicit request body modes and content-type boundary ownership.
- [ ] Provide progress/cancellation adapters only where runtime supports them.
- [ ] Allow custom operation upload endpoints and large-file streaming adapters.
- [ ] Document filename, limits, validation and safe retry defaults.
- [ ] Test: Binary integrity, multipart boundary, abort, errors and no duplicate uploads.
- [ ] Test: Browser and Node compatibility tests.
- [ ] New public APIs have compile-time and runtime tests as applicable.
- [ ] Examples/docs state what is available and what is not.
- [ ] No optional integration becomes a mandatory Core dependency.
- [ ] Released distribution smoke tests pass where relevant.
- [ ] No implementation/version-completion claim until tests and review pass.
