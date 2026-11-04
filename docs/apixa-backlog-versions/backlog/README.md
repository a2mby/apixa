# Apixa — Proposed backlog versions

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

This catalog records **18 separately scoped proposals**, not a decision to implement or release all of them. The numbering is a suggested planning sequence; version numbers can change without affecting shipped history.

| #   | Proposed version | Topic                                                                          | Priority | Origin                                   |
| --- | ---------------- | ------------------------------------------------------------------------------ | -------- | ---------------------------------------- |
| 01  | `v0.12.0`        | [TanStack Query integration hardening](versions/v0.12.0/context.md)            | Critical | Existing backlog                         |
| 02  | `v0.13.0`        | [Zod and runtime schema validation](versions/v0.13.0/context.md)               | High     | New integration                          |
| 03  | `v0.14.0`        | [React Hook Form integration](versions/v0.14.0/context.md)                     | Optional | Existing backlog + requested integration |
| 04  | `v0.15.0`        | [Unified package and modular installation](versions/v0.15.0/context.md)        | High     | Existing backlog                         |
| 05  | `v0.16.0`        | [Public API cleanup and entrypoints](versions/v0.16.0/context.md)              | High     | Existing backlog                         |
| 06  | `v0.17.0`        | [Testing and CI hardening](versions/v0.17.0/context.md)                        | Critical | Existing backlog                         |
| 07  | `v0.18.0`        | [Cross-platform and bundler compatibility](versions/v0.18.0/context.md)        | High     | Existing backlog                         |
| 08  | `v0.19.0`        | [Documentation, examples and migration guides](versions/v0.19.0/context.md)    | High     | Existing backlog                         |
| 09  | `v0.20.0`        | [npm publishing, semver and releases](versions/v0.20.0/context.md)             | High     | Existing backlog                         |
| 10  | `v0.21.0`        | [File uploads and multipart requests](versions/v0.21.0/context.md)             | High     | New integration                          |
| 11  | `v0.22.0`        | [File downloads and binary responses](versions/v0.22.0/context.md)             | High     | New integration                          |
| 12  | `v0.23.0`        | [WebSockets and bidirectional realtime](versions/v0.23.0/context.md)           | Medium   | New integration                          |
| 13  | `v0.24.0`        | [Outgoing and incoming webhooks](versions/v0.24.0/context.md)                  | Medium   | New integration                          |
| 14  | `v0.25.0`        | [Authentication adapters and credential policies](versions/v0.25.0/context.md) | Medium   | Recommended integration                  |
| 15  | `v0.26.0`        | [Server-Sent Events and streaming responses](versions/v0.26.0/context.md)      | Medium   | Recommended integration                  |
| 16  | `v0.27.0`        | [OpenAPI import/export and code generation](versions/v0.27.0/context.md)       | Medium   | Recommended integration                  |
| 17  | `v0.28.0`        | [Observability, tracing and diagnostics](versions/v0.28.0/context.md)          | Medium   | Recommended integration                  |
| 18  | `v0.29.0`        | [Performance benchmarks and optimization gates](versions/v0.29.0/context.md)   | Medium   | Existing backlog                         |

## Relationship to the existing repository

- The established repo has `versions/v0.1.0/` through `versions/v0.11.0/` as historical milestone contracts. **Do not edit or overwrite them.**
- Its `versions/README.md` says not to create empty future version directories. These backlog folders are in `backlog/versions/`, are filled with planning files, and are **not active coding contracts**.
- The A–F spec is an existing independent set of decisions. Treat A–F as a prerequisite, not as already completed merely because these backlogs exist.
- To activate an item, review/approve its design and promote it to the regular `versions/vX.Y.Z/` structure via the project's normal `/start-version` process.
- Dates, schedules and release commitments have intentionally not been assigned.

## Architecture rules

```text
optional integrations → @apixa/core
@apixa/core ↛ optional integrations
```

An `apixa` facade must not make React, Zod, Node-only APIs, WebSocket providers or React Hook Form mandatory for core-only users. Webhooks are fundamentally server-side; browser clients cannot securely receive signed webhook POST requests. Uploads/downloads are HTTP binary/multipart behavior; WebSockets and SSE are distinct realtime protocols.
