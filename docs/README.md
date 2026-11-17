# Documentation

Living project direction stays in [context.md](./context.md). The active coding contract is the version folder named by [versions/README.md](../versions/README.md).

## Living contracts

These files stay in this folder. Tooling, rules, and milestone docs address them by these paths.

| File                                         | Role                                                |
| -------------------------------------------- | --------------------------------------------------- |
| [context.md](./context.md)                   | Identity, principles, constraints                   |
| [architecture.md](./architecture.md)         | Core shape, request flow, source map                |
| [public-api.md](./public-api.md)             | Export contract for every public entry point        |
| [conventions.md](./conventions.md)           | How we build and document                           |
| [roadmap.md](./roadmap.md)                   | Phases; later versions as headings until they start |
| [story.md](./story.md)                       | Dated log, newest first                             |
| [use-cases.md](./use-cases.md)               | Manual-testing catalog                              |
| [external-context.md](./external-context.md) | Bootstrap for an agent outside this repo            |

## Decisions and audits

| Folder                     | Role                                         |
| -------------------------- | -------------------------------------------- |
| [decisions/](./decisions/) | ADRs: Context, Decision, Consequences        |
| [audits/](./audits/)       | Point-in-time reviews of a design or surface |

## Guides

Task how-tos live under [guides/](./guides/). Human prose and agent checklists stay separated, then split by topic:

| Topic           | Humans                                                                             | Agents                                                               |
| --------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Getting started | [install, first API, React](./guides/humans/getting-started/)                      | —                                                                    |
| Features        | [schemas, pagination, files, operations, mocks, errors](./guides/humans/features/) | —                                                                    |
| Migrations      | [v2 to v3, adopt Apixa](./guides/humans/migrations/)                               | [protocol, audit, gaps, prompt, policy](./guides/agents/migrations/) |
| Contributing    | [bugs, local package, datasets, publish](./guides/humans/contributing/)            | [plan and land, dataset catalog](./guides/agents/contributing/)      |

A new guide goes in the topic folder for its reader, and both that folder's README and [guides/README.md](./guides/README.md) gain a row.
