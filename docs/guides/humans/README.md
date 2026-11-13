# Guides for humans

Task-oriented notes if you want to change Apixa without reading the whole architecture first.

| Guide                                                             | When to read it                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Migrate from Apixa v2 to v3](./migrate-v2-to-v3.md)              | You are upgrading existing v2 code to `3.0.0-rc.0`                            |
| [Install Apixa and choose an entry point](./install-apixa.md)     | You need the right `apixa` subpath and optional peer dependencies             |
| [Extend mock dataset types](./extend-mock-dataset-types.md)       | You want new autocomplete ids for `mock: "…"`                                 |
| [Fix a small bug](./fix-a-small-bug.md)                           | Something is wrong and the fix should stay small                              |
| [Test a local build in a consumer app](./test-a-local-package.md) | You want to try a fix in a real app without publishing to npm                 |
| [Production file handling](./production-file-handling.md)         | You ship uploads/downloads/transfers and need guarantees, limits and recovery |
| [Publish Apixa to npm latest](./publish-a-release.md)             | You are publishing an approved version to npm `latest`                        |

For agent-oriented checklists of the same ideas, see [`../agents/`](../agents/).
