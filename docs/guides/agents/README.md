# Guides for agents

Checklists and paths for coding agents working in this repo.

| Guide                                                             | When to use it                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Extend mock dataset types](./extend-mock-dataset-types.md)       | Adding a built-in catalog entry (`MockDatasetCatalog` / `MockDatasetIds`)                         |
| [Production file handling](../humans/production-file-handling.md) | Answering questions on file guarantees, limits, ownership; check it before changing file behavior |
| [Plan and land a change](./plan-and-land-change.md)               | `/plan-change` → implement → `/git-push`                                                          |

Release work is its own workflow: use the `publish-library` skill (`.agents/skills/publish-library/`)
only when the owner explicitly requests a publish; see the [human release guide](../humans/publish-a-release.md).

Human-readable versions: [`../humans/`](../humans/).

Shared rules: `.ai/rules/` (activation is recorded per rule); repository entry point: `AGENTS.md`. Workflow skill: `.agents/skills/apixa-workflow/`. See [AI configuration](../../../.ai/README.md) for provider invocation, discovery and synchronization.
