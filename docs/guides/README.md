# Guides

Short how-tos. They are not a second [context](../context.md) or a second [architecture](../architecture.md).

| Folder               | Audience                              | Style                              |
| -------------------- | ------------------------------------- | ---------------------------------- |
| [humans/](./humans/) | People reading in a browser or editor | Plain language, light on commands  |
| [agents/](./agents/) | Coding agents                         | Checklists, paths, workflow skills |

Same topics may exist in both folders with different detail. Use the folder that matches the reader.

## Topics

| Topic           | Humans                                        | Agents                                                                                            |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Getting started | [getting-started/](./humans/getting-started/) | —                                                                                                 |
| Features        | [features/](./humans/features/)               | File guarantees are in the [production file guide](./humans/features/production-file-handling.md) |
| Migrations      | [migrations/](./humans/migrations/)           | [migrations/](./agents/migrations/)                                                               |
| Contributing    | [contributing/](./humans/contributing/)       | [contributing/](./agents/contributing/)                                                           |

Put a new guide in one of those topic folders and add a row to that folder's README and to the audience README.

Living docs stay next to this tree: [context](../context.md), [architecture](../architecture.md), [conventions](../conventions.md), [roadmap](../roadmap.md), [story](../story.md), [decisions/](../decisions/), [audits/](../audits/). The map of the whole `docs/` tree is [docs/README.md](../README.md).

## Start here

- [Install Apixa and choose an entry point](./humans/getting-started/install-apixa.md)
- [Define your first API](./humans/getting-started/define-your-first-api.md)
- [Adopt Apixa in an existing project](./humans/migrations/adopt-apixa.md)
- [Migrate from Apixa v2 to v3](./humans/migrations/v2-to-v3.md)
- [Agent migration protocol](./agents/migrations/migrate-consumer-to-apixa.md)
