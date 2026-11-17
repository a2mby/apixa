# Migration guides

Two different jobs share this folder.

| Guide                                                   | Job                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Migrate from Apixa v2 to v3](./v2-to-v3.md)            | The project already imports Apixa and must move to the `3.0.0-rc.0` call contract                                     |
| [Adopt Apixa in an existing frontend](./adopt-apixa.md) | The project uses Axios, Fetch, or another client and should gain a small Apixa layer without inventing backend routes |

Adoption is driven by the agent set in [../../agents/migrations/](../../agents/migrations/): policy, backend audit, implementation protocol, capability-gap report, and a prompt you can paste into the consumer repository.

Examples in these guides illustrate the documented `createResource` / `defineApi` shape. Before changing a consumer, confirm the version installed there. When that release includes unified `settings`, put it on `defineApis` options, `defineApi`, or a resource. Operations do not take a `settings` object. Do not add other optional configuration until that syntax is confirmed in the installed release.

The published npm `latest` package remains `apixa@2.0.0` while `3.0.0-rc.0` is prepared in this repository. Say which one the consumer is on.
