# Consumer migration (agents)

Read these in order when converting an existing frontend API layer to Apixa. Stay inside the consumer work you were asked to do.

| Order | Guide                                                        | Role                                                                                    |
| ----- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1     | [Policy](./policy.md)                                        | Evidence before configuration                                                           |
| 2     | [Audit backend endpoints](./audit-backend-endpoints.md)      | Routes, validators, auth, response contracts, pagination, and the callers that use them |
| 3     | [Migrate a consumer project](./migrate-consumer-to-apixa.md) | Design, implement, and verify the smallest accurate Apixa layer                         |
| 4     | [Capability-gap report](./capability-gap-report.md)          | Separate real SDK limits from custom operations and backend issues                      |
| 5     | [Copy-paste prompt](./consumer-migration-prompt.md)          | Self-contained instructions for an agent that only has the consumer repository          |

The human-facing version is [Adopt Apixa](../../humans/migrations/adopt-apixa.md).

Confirm the Apixa version installed in the consumer project before treating an example or an ADR as available syntax. When that release includes unified `settings`, it belongs on `defineApis` options, `defineApi`, and resources. Operations do not take a `settings` object; they keep `timeout`, `retry`, `response`, `middleware`, and `schema`. Do not prescribe other optional configuration until that release documents it.

These files already live in this repository. Copying a second tree on top of `docs/guides/` is not required.
