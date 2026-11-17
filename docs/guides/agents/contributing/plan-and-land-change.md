# Plan and land a change (agents)

## Commands

| Step  | Command                           | Output                                          |
| ----- | --------------------------------- | ----------------------------------------------- |
| Start | `/plan-change <brief>`            | GitHub issue + `task/N-slug` from latest `main` |
| Code  | (implement against issue Touches) | Stay on that branch                             |
| Land  | `/git-push`                       | Format → commit → PR → squash merge → story     |

Do not stack a second change on an existing `task/…` branch. Do not `/git-push` from `main`.

## `/plan-change` must include

- Title = outcome
- Body: Asked for / Active version / problem / outcome / **Touches** / **Tests**
- Functional changes → concrete `tests/…` files on Touches
- Docs-only → `Tests: none (no functional change)`

## Before coding

1. `docs/context.md` (do not recap in chat).
2. Active folder under `versions/` (`versions/README.md`). None open → do not invent a version folder.
3. Issue Touches list — stop if you need a file not listed (except Prettier-only after format).

## `/git-push` must

1. Confirm branch is `task/N-slug` and matches issue N.
2. `git fetch` + rebase onto `origin/main`.
3. Append `docs/story.md` (newest first).
4. Run `npm run format` — stage Touches **and** Prettier-only extras (allowed outside Touches).
5. Commit `type: why`, push, PR with `Closes #N`, squash merge, delete branch.
6. Confirm local `main` == `origin/main`.

## Hard stops

- On `main` with no task branch → stop.
- Non-format edits outside Touches → stop and name files.
- Empty future `versions/vX.Y.Z/` → stop.
- New packages (`transport-fetch`, etc.) unless active scope says so → stop.
- Edit non-Next examples unless the user named that example → stop.
