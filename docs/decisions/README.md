# Decisions

Architecture decision records. Each file is Context, Decision, and Consequences. Newer numbers do not replace older ones; read the record that owns the question.

| ADR | Record                                                                     | Decision                                                                          |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 001 | [Framework-agnostic Core](./001-framework-agnostic-core.md)                | Core stays free of React, Next.js, and TanStack Query and returns native promises |
| 002 | [Transport abstraction](./002-transport-abstraction.md)                    | Request execution goes through a transport; Fetch stays inside Core               |
| 003 | [Client-scoped mocking](./003-client-scoped-mocking-in-core.md)            | Mocking is a client-scoped branch of the same pipeline, not a second client       |
| 004 | [Four packages](./004-four-packages-and-private-shared-internals.md)       | Core, Mocking, React, and a private shared layer                                  |
| 005 | [Single package distribution](./005-single-package-distribution.md)        | One published npm package, `apixa`, with private workspace implementations        |
| 006 | [Per-operation schema](./006-operation-schema-and-simplified-api-state.md) | `schema` on operations and a flat `ApiState`                                      |
| 007 | [Unified v3 contract](./ADR-007-apixa-v3-unified-api-contract.md)          | v3 operations, responses, reliability, and call shapes                            |
| 008 | [Unified advanced settings](./008-unified-advanced-settings.md)            | One `settings` input resolved through the existing layer rules                    |

The human guide for ADR-006 is [Schemas and ApiState](../guides/humans/features/schemas.md). The v2-to-v3 upgrade guide is [Migrating from Apixa v2 to v3](../guides/humans/migrations/v2-to-v3.md).
