---
description: Read the current changes, open one or more issues, and land each on main with no brief and no pause
---

The developer ran `/ship-changes` with no brief. The work is already in the working tree. Read it, decide what the issue or issues are, then land each one on `main`. This command does `/plan-change` and `/git-push` back to back, with no stop between them. Do not ask for a yes. The command is the yes.

This command is self-contained. Everything it needs is written below.

## Stop first

Run `git status --short` and `git branch --show-current`.

Stop if there are no changes to ship (nothing modified, deleted, or untracked that belongs in the repo).

Stop if the current branch is `task/N-slug` with an open issue or pull request. Tell the developer to use `/git-push` for that branch.

Stop and name the branch if it is any other non-`main` branch that already has commits not on `main`. Do not build on it.

Read `docs/context.md` and the **Current** folder under `versions/` (see `versions/README.md`). Do not recap the project.

## Read the changes

Read the real diff, not just file names: `git diff HEAD` and the content of untracked files that are part of the change.

Do not ship these. Leave them unstaged and say so in the reply:

- `.env`, credentials, tokens, a `package-lock.json` from an unrelated install.
- Caches, build output, generated graphs, and local tool state (for example `graphify-out/`, `.ua/`, `.codex/`, `dist/`, `.next/`, `*.tsbuildinfo`).
- Anything unrelated to the work that the diff does not explain.

A tooling or config file is shippable only when the diff shows it was written on purpose (for example `AGENTS.md` or a command file).

## Decide the issues

Split the shippable files into groups. One group is one outcome a teammate could review and revert on its own.

- Put each file in exactly one group. Do not split a file across groups. If one file mixes two outcomes, keep it in the group it mostly serves and say so in the reply.
- Keep a test with the behavior it covers. Keep docs with the change they describe.
- Prefer fewer, larger groups over many tiny ones. One group is fine when the work is one outcome. Split when the outcomes are independent (for example a Core change and an unrelated docs or tooling change).
- Order the groups so each one still builds on its own. Put a group that others depend on first.

If the brief-less diff asks for something in the active version's **Out** of scope, say so in the issue body and in chat. Do not pretend it is in scope.

Name each issue by its outcome. "Require explicit kind on custom operations" is a title. "Updates" and "Working on core" are not.

## For each group, in order

### 1. Write the issue

Body, in this order:

```markdown
Asked for: ship the current working-tree changes (no brief); this group covers <short description>

Active version: vX.Y.Z

<One or two sentences on the problem.>

<One or two sentences on the outcome.>

Touches:

- path/to/file

Tests:

- tests/<area>/<name>.test.ts — <what behavior this covers>
```

Touches lists every file in the group. Include `docs/story.md` and any `docs/` or `versions/vX.Y.Z/*` file you will update.

Tests are required for any change to runtime behavior, public API, types that affect callers, error paths, URL/body/headers, or operation generation. Put concrete files and behaviors in the Tests section and on Touches. If the group has behavior changes and no tests, write the tests now as part of this group. Use an injectable or fake `Transport`; no live network as the primary suite. Write `Tests: none (no functional change)` only for docs-only or process-only groups, and say why in chat.

Label it `task`. The repo is `a2mby/apixa`.

```bash
gh issue create --repo a2mby/apixa --title "<outcome>" --label "task" --body "$(cat <<'EOF'
...
EOF
)"
```

### 2. Make the branch

Always start from latest `main`. N is the new issue number. The slug is short, lowercase, and hyphenated.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c task/N-slug
```

The dirty tree comes with you. Files from later groups stay dirty and unstaged. If the pull or switch would overwrite a dirty file, stop and name the files.

### 3. Do the work

The change already exists in the tree. Finish it: add the tests the issue lists, fix anything the checks below expose, and update the docs the issue lists. Do not widen the scope beyond the group's Touches.

Update `docs/context.md` when the current picture changed.

If acceptance criteria for the active version were completed, check them off in `versions/vX.Y.Z/acceptance-criteria.md` and note completion in the story entry.

Add an entry at the **top** of `docs/story.md` (newest first). Do not edit an older entry.

```markdown
## YYYY-MM-DD — Short outcome title

Two or three sentences. What landed, and what it changed about the repo. Name the version if this advanced a milestone.
```

Use today's date. Name the outcome. "Updated docs" is not an entry.

### 4. Check

Run these from the repo root. Stop and report the failure if any fails. Do not hide it with `any`, `@ts-ignore`, or a skipped test.

```bash
corepack pnpm typecheck
corepack pnpm test
```

Skip a check only when the group is docs-only, and say that you skipped it.

### 5. Format

From the repo root, **always** run before staging, even when nothing looks dirty:

```bash
npm run format
```

Stage the group's Touches files plus any Prettier-only diffs, even outside Touches. Stop for any non-format edit outside Touches and name the file. Do not add it quietly.

### 6. Commit

Subject is `type: why`, present tense, under 72 characters, no trailing period. Types used here are `feat`, `fix`, `docs`, and `chore`.

The body is one or two sentences a teammate would want in `git log`. Skip the body only when the subject already says the why.

```bash
git add <files on the Touches list> <prettier-touched files>
git commit -m "$(cat <<'EOF'
type: why

Why this change exists.

EOF
)"
```

Leave the other groups' files unstaged.

### 7. Update from main, then push

Before push and before merge, always pull latest `main` into the task branch. Never push or merge from a stale base.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch task/N-slug
git rebase --autostash origin/main
```

If the rebase stops on conflicts, stop and name the files. Do not push or merge until the branch is rebased on latest `main`.

```bash
git push -u origin HEAD
```

If the branch was already on the remote and the rebase rewrote commits, use `git push --force-with-lease`.

### 8. Pull request

If this branch already has an open pull request, use it. Do not open a second one.

If it does not, create one. The first line is `Closes #N`. The title matches the issue outcome.

```bash
gh pr create --repo a2mby/apixa --base main --title "<outcome>" --body "$(cat <<'EOF'
Closes #N

## Summary
- What changed, in one line per point.

## Test plan
- [ ] What a person can check.

EOF
)"
```

### 9. Merge

Run the update-from-main steps from step 7 again. If the rebase moved commits, push with `--force-with-lease`. Then merge:

```bash
gh pr merge N --repo a2mby/apixa --squash --delete-branch
```

Confirm `main` is checked out, it matches `origin/main`, and the task branch is gone. `Closes #N` closes the issue. Do not close it by hand before the merge.

### 10. Next group

Return to step 1 for the next group. The remaining dirty files are still in the tree. Run `git status --short` to confirm only the remaining groups' files and the files you chose not to ship are left.

## Reply

For each group, send the issue URL, the pull request URL, the squash commit on `main`, and the story sentences you added. Then list what was left unshipped and why. Say plainly if a check was skipped or a file was kept in a group it only partly belongs to.
