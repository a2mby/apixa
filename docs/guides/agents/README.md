# Guides for agents

Checklists and paths for coding agents in this repo, and for agents converting a consumer repository to Apixa.

| Folder                           | When                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| [migrations/](./migrations/)     | Backend-first conversion of an existing frontend API layer |
| [contributing/](./contributing/) | Plan, implement, and land a change in this repository      |

| Also read                                                                  | When                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Production file handling](../humans/features/production-file-handling.md) | Before changing upload, download, or transfer behavior                |
| [Human guides](../humans/)                                                 | When the reader is a person, or the checklist points at a prose guide |

Release work is its own workflow: use the `publish-library` skill (`.agents/skills/publish-library/`) only when the owner explicitly requests a publish. The owner-facing steps are the [human release guide](../humans/contributing/publish-a-release.md).

Shared rules: `.ai/rules/` (activation is recorded per rule). Repository entry point: `AGENTS.md`. Workflow skill: `.agents/skills/apixa-workflow/`. See [AI configuration](../../../.ai/README.md) for provider invocation, discovery, and synchronization.
