---
name: apixa-workflow
description: >-
  Enforces Apixa docs/versions structure and milestone coding workflow. Use when
  implementing Core, starting a version, editing docs or versions, planning a
  change, checking project structure, or when the user mentions defineApi,
  v0.1.0, roadmap, acceptance criteria, or Apixa conventions.
---

# Apixa workflow

## Always read first

1. `docs/context.md` — principles (do not recap in chat)
2. Active milestone: check `versions/README.md`, then read that folder’s four files
3. `docs/conventions.md` if unsure about process

## Decide what kind of work this is

| User intent                  | Do this                                        |
| ---------------------------- | ---------------------------------------------- |
| Start a change / issue       | Follow `.cursor/commands/plan-change.md`       |
| Implement the active version | Follow `.cursor/commands/implement-version.md` |
| Open a new milestone folder  | Follow `.cursor/commands/start-version.md`     |
| Land / merge                 | Follow `.cursor/commands/git-push.md`          |
| Audit layout                 | Follow `.cursor/commands/check-structure.md`   |

## Hard stops

Stop and say why if asked to:

- Create empty `versions/v0.2.0` (etc.) “for later”
- Add `packages/transport-fetch|client|server|mocking|tanstack-query|openapi` outside active scope
- Put React / Next / TanStack Query into `@apixa/core`
- Duplicate living context at repo root as `context.md`
- Rewrite a shipped version folder for new features (open a new version instead)
- Ship example/README syntax that is not implemented yet

## Version folder template

Every `versions/vX.Y.Z/` must contain filled:

- `context.md` — frozen goal for this release only
- `scope.md` — In / Out tables
- `implementation-plan.md` — ordered steps + file touch list
- `acceptance-criteria.md` — checkboxes

Copy shape from `versions/v0.1.0/`, not from memory.

## Coding loop (active version)

1. Pick the next unchecked step in `implementation-plan.md`
2. Stay inside `scope.md` In; refuse Out items
3. Prefer reshaping existing Core files over new abstractions
4. Keep exports honest in `packages/core/src/index.ts`
5. Update example + tests when behavior ships
6. Check off `acceptance-criteria.md` as evidence exists
7. Append `docs/story.md` when the milestone meaningfully advances or completes

## Related

- Architecture: `docs/architecture.md`
- Roadmap: `docs/roadmap.md`
- ADRs: `docs/decisions/`
- Rules: `.cursor/rules/apixa-*.mdc`
