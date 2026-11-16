---
name: ship-changes
description: "Read the current changes, open one issue per outcome, and land them on main in one pull request"
---

The developer ran `/ship-changes` with no brief. The work is already in the working tree. Read it, open one issue per outcome the diff solves, then land every issue on `main` through one branch and one pull request. Do not ask for a yes. The command is the yes.

This command is self-contained. Everything it needs is written below. Do not run `/plan-change` or `/git-push` once per issue. Those workflows open a branch and a pull request per issue, and this command exists to avoid that wait.

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

Count the outcomes in the diff. Open one issue for each outcome. A diff that solves three things gets three issues. A shared file is not a reason to merge two outcomes into one issue. One outcome still gets one issue.

- Put each file on exactly one issue: the outcome it mostly serves. When a file also serves another outcome, say so in the reply.
- Keep a test with the behavior it covers. Keep docs with the change they describe.
- Order the issues so a later outcome can build on an earlier one.

If the brief-less diff asks for something in the active version's **Out** of scope, say so in that issue's body and in chat. Do not pretend it is in scope.

Name each issue by its outcome. "Require explicit kind on custom operations" is a title. "Updates" and "Working on core" are not.

The issues stay separate. The branch does not. Every issue in this run shares one branch, one commit, and one pull request.

## 1. Write every issue

Create every issue before the branch. Body, in this order:

```markdown
Asked for: ship the current working-tree changes (no brief); this issue covers <short description>

Active version: vX.Y.Z

<One or two sentences on the problem.>

<One or two sentences on the outcome.>

Touches:

- path/to/file

Tests:

- tests/<area>/<name>.test.ts — <what behavior this covers>
```

Touches lists every file on that issue. Include `docs/story.md` and any `docs/` or `versions/vX.Y.Z/*` file you will update for that outcome.

Tests are required for any change to runtime behavior, public API, types that affect callers, error paths, URL/body/headers, or operation generation. Put concrete files and behaviors in the Tests section and on Touches. If an issue has behavior changes and no tests, write the tests now as part of that issue. Use an injectable or fake `Transport`; no live network as the primary suite. Write `Tests: none (no functional change)` only for docs-only or process-only issues, and say why in chat.

Label each issue `task`. The repo is `a2mby/apixa`.

```bash
gh issue create --repo a2mby/apixa --title "<outcome>" --label "task" --body "$(cat <<'EOF'
...
EOF
)"
```

## 2. Make one branch

Always start from latest `main`. N is the lowest issue number from this run. The slug names the shipment: short, lowercase, and hyphenated.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c task/N-slug
```

The dirty tree comes with you. If the pull or switch would overwrite a dirty file, stop and name the files.

## 3. Do the work

The change already exists in the tree. Finish every issue: add the tests each issue lists, fix anything the checks below expose, and update the docs each issue lists. Stay inside the Touches lists. Do not widen the shipment past them.

Update `docs/context.md` when the current picture changed.

If acceptance criteria for the active version were completed, check them off in `versions/vX.Y.Z/acceptance-criteria.md` and note completion in the story entry.

Add one entry per issue at the **top** of `docs/story.md` (newest first). Write the last issue's entry first so the first issue stays on top. Do not edit an older entry.

```markdown
## YYYY-MM-DD — Short outcome title

Two or three sentences. What landed, and what it changed about the repo. Name the version if this advanced a milestone.
```

Use today's date. Name the outcome. "Updated docs" is not an entry.

## 4. Check once

Run these once, from the repo root, for the whole shipment. Stop and report the failure if any fails. Do not hide it with `any`, `@ts-ignore`, or a skipped test.

```bash
corepack pnpm typecheck
corepack pnpm test
```

Skip a check only when every issue is docs-only, and say that you skipped it.

## 5. Format

From the repo root, **always** run before staging, even when nothing looks dirty:

```bash
npm run format
```

Stage every Touches file from every issue, plus any Prettier-only diffs, even outside Touches. Stop for any non-format edit outside those Touches lists and name the file. Do not add it quietly.

## 6. Commit once

One commit covers every issue. Subject is `type: why`, present tense, under 72 characters, no trailing period. Types used here are `feat`, `fix`, `docs`, and `chore`. The subject names the shipment.

The body names each issue number and its outcome, one line each.

```bash
git add <files on every Touches list> <prettier-touched files>
git commit -m "$(cat <<'EOF'
type: why

#N <outcome>
#M <outcome>

EOF
)"
```

Leave unshipped files unstaged.

## 7. Update from main, then push once

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

## 8. One pull request

If this branch already has an open pull request, use it. Do not open a second one for another issue in this shipment.

The title names the shipment. The first lines close every issue from this run.

```bash
gh pr create --repo a2mby/apixa --base main --title "<shipment>" --body "$(cat <<'EOF'
Closes #N
Closes #M

## Summary
- #N — what that issue changed, in one line.
- #M — what that issue changed, in one line.

## Test plan
- [ ] What a person can check.

EOF
)"
```

## 9. Merge

Run the update-from-main steps from step 7 again. If the rebase moved commits, push with `--force-with-lease`. Then merge that pull request:

```bash
gh pr merge <pull-request-number> --repo a2mby/apixa --squash --delete-branch
```

Confirm `main` is checked out, it matches `origin/main`, and the task branch is gone. Each `Closes #N` line closes that issue. Do not close an issue by hand before the merge.

## Reply

Send each issue URL and the story sentences for that issue. Then send the one pull request URL and the squash commit on `main`. Then list what was left unshipped and why. Say plainly if a check was skipped or a file was kept on an issue it only partly belongs to.
