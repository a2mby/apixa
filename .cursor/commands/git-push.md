---
description: Commit the change, open the pull request, squash merge, and write the log
---

The developer is done. `/git-push` is the yes to merge. Close the work by landing it on `main`.

## Stop first

Read the branch name. It must be `task/N-slug`. N is the issue number. If you are on `main`, stop.

Read issue N. Stay inside its Touches list. If a file you need is not listed, stop and name it. Do not add it quietly.

**Exception:** after `npm run format` (required below), Prettier-only changes outside Touches are allowed and must be staged. Stop only for non-format edits outside Touches.

If there is nothing to commit and no existing pull request, stop.

Leave unrelated dirty files unstaged. Do not commit `.env`, credentials, or a `package-lock.json` from an unrelated install.

## Update from main

Before push and before merge, always pull latest `main` into the task branch. Never push or merge from a stale base.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch task/N-slug
git rebase origin/main
```

If the rebase stops on conflicts, stop and name the files. Do not push or merge until the branch is rebased on latest `main`.

## Log the change

Update `docs/context.md` when the current picture changed.

If acceptance criteria for the active version were completed, check them off in `versions/vX.Y.Z/acceptance-criteria.md` and note completion in the story entry.

Add an entry at the **top** of `docs/story.md` (newest first). Do not edit an older entry.

```markdown
## YYYY-MM-DD — Short outcome title

Two or three sentences. What landed, and what it changed about the repo. Name the version if this advanced a milestone.
```

Use today's date. Name the outcome. "Updated docs" is not an entry.

## Format

From the repo root, **always** run before staging:

```bash
npm run format
```

Stage Touches files plus any Prettier-only diffs. Format-only files outside Touches are allowed.

## Commit

Subject is `type: why`, present tense, under 72 characters, no trailing period. Types used here are `feat`, `fix`, `docs`, and `chore`.

The body is one or two sentences a teammate would want in `git log`. Skip the body only when the subject already says the why.

```text
docs: add version coding contract for v0.1.0

Agents and humans need a frozen scope and acceptance checklist before Core work.
```

```bash
git add <files on the Touches list> <prettier-touched files>
git commit -m "$(cat <<'EOF'
type: why

Why this change exists.

EOF
)"
```

Run the Update from main steps, then push:

```bash
git push -u origin HEAD
```

If the branch was already on the remote and the rebase rewrote commits, use `git push --force-with-lease`.

## Pull request

If this branch already has an open pull request, use it. Do not open a second one.

If it does not, create one. The first line is `Closes #N`.

```bash
gh pr create --repo a2mby/apixa --base main --title "Add defineApi resource generation" --body "$(cat <<'EOF'
Closes #N

## Summary
- What changed, in one line per point.

## Test plan
- [ ] What a person can check.

EOF
)"
```

The title matches the issue outcome.

## Merge

Run the Update from main steps again. If the rebase moved commits, push with `--force-with-lease`. Then merge.

```bash
gh pr merge N --repo a2mby/apixa --squash --delete-branch
```

Confirm `main` is checked out, it matches `origin/main`, and the task branch is gone. `Closes #N` closes the issue. Do not close it by hand before the merge.

## Reply

Send the pull request URL, the squash commit on `main`, and the story sentences you added.
