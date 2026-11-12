---
name: publish-library
description: >-
  Release the unscoped Apixa npm package to the latest dist-tag. Use only when
  the owner requests to publish/release Apixa. Complete release housekeeping,
  verify locally and on GitHub CI, publish exactly one package, and verify npm.
---

# Publish Apixa (command-driven, low-context)

Run commands; inspect **exit codes and short error excerpts only**. Do not read the entire codebase, narrate routine successes, perform broad audits, or repeat completed tests. One concise final report. Never assume a queued publish is successful.

Owner-facing checklist: `docs/guides/humans/publish-a-release.md`.

## Invariants

- Repository `a2mby/apixa`; publish **only** unscoped root `apixa` to `latest` (never `next`, `beta`, recursive, a workspace, or an `@apixa/*` scope). Require `package.json` `name === "apixa"`, `private !== true`, `publishConfig.tag === "latest"` and `publishConfig.access === "public"`. All implementation workspace packages must have `private: true`.
- Latest _npm dist-tag_ does **not** mean stable semantic version. Keep the current beta/RC version scheme; never silently promote a prerelease to a stable version or bump major/minor. Pick a fresh explicit version; if the requested version or next version policy is ambiguous, ask the owner.
- Never skip a failing gate, use `--force`, expose credentials, alter npm ownership, change branch protections, or publish with untracked/untested source changes.
- Stop for: actual product defects, API/architecture changes, failing tests or checks, merge conflicts, unexpected npm tags, unverified permissions, security concerns, and any unclear release/version decision. Ask once, then resume at the failed step when answered.
- Allowed automatic fixes: obvious nonsemantic whitespace/formatting, missing generated outputs fixed by existing build, a proven transient CI/network retry once. Recheck the affected gate after each fix. Do not alter tests to make them green.

## Procedure

1. **Inspect briefly:** `git status --short --branch; git fetch origin --prune; gh auth status; npm whoami`. Abort if wrong repo, missing access, unexpected dirty files, secrets (`.env*`, auth-bearing `.npmrc`, tokens), or conflicting work. Identify release milestone and associated issues/PRs via `gh issue list` and `gh pr list` (small JSON summaries only). Do **not** close every open issue: close only verified, merged work associated with this release. Leave unrelated/unresolved issues open and list them at the end.
2. **Land remaining work:** Use the existing `.agents/skills/git-push/SKILL.md` workflow for eligible `task/N-*` branches, with relevant reviewed changes, minimal commits, a PR, passing PR checks, and squash merge. Never stage unknown files with `git add -A`. No auto-merge of unrelated work. On `main`: `git pull --ff-only origin main`; require clean tree. If release housekeeping changes are needed, use a proper task branch + PR before proceeding.
3. **Decide release version:** Read root `package.json` version and `npm view apixa dist-tags --json`; compare with `npm view apixa@<version> version`. Require a new, never-published valid SemVer version. Use the approved milestone's version or ask when unspecified. For a prerelease series increment its prerelease identifier, not `npm version patch` (which may turn an RC into stable). Apply the agreed version, commit/PR/merge and use the new clean `origin/main` SHA.
4. **Local gate:** `corepack pnpm install --frozen-lockfile && corepack pnpm verify && corepack pnpm verify:publish`. The last command is read-only and must validate root-only tarball, npm rights and a `latest` dry-run. `git status --porcelain` must remain clean afterward. If a trivial fix changes any tracked file, commit/merge it and restart verification and CI on the new SHA.
5. **GitHub CI gate:** Record `SHA=$(git rev-parse HEAD)` after `git switch main && git pull --ff-only origin main`. Use `gh run list --repo a2mby/apixa --workflow ci.yml --commit "$SHA" --json databaseId,headSha,status,conclusion` then `gh run watch <run-id> --repo a2mby/apixa --exit-status` if in progress. Require **success for this exact SHA** and both CI `verify` matrix jobs (Node 22 and 24): inspect `gh run view <run-id> --repo a2mby/apixa --json headSha,conclusion,jobs`. Never rely on a green check for a previous commit, branch, or PR alone. Do not proceed if runs/jobs are missing or cancelled.
6. **Publish exactly checked contents:** Confirm clean SHA, tag policy, `npm whoami`, and publishing permission again. Create an isolated directory with `RELEASE_TMP=$(mktemp -d)`; run `corepack pnpm pack --pack-destination "$RELEASE_TMP"` from the repo **root**. Set `TARBALL="$RELEASE_TMP/apixa-$(node -p "require('./package.json').version").tgz"`. Inspect packed `package/package.json` for `name`, `version`, `publishConfig`, files and zero private workspace dependencies. Publish _that exact tarball_ with `npm publish "$TARBALL" --tag latest --access public`. Clean up the temporary directory after verification. If npm requires interactive 2FA or new authentication, hand it to the owner; do not solicit or print credentials in chat. Never retry a publication blindly: first check if the exact version is already live.
7. **Confirm registry result:** `npm view apixa@<version> version --json`; `npm dist-tag ls apixa`; `npm view apixa@latest version --json`. Require the exact new version to exist and `latest` to point to it. Smoke-check fresh `npm install apixa@latest` in an empty temp project if feasible. If npm publish returned success but registry lookup is temporarily stale, report **"publish accepted; registry visibility not yet confirmed"**, not "everything okay" or "in npm's queue". Retry a short bounded lookup, then stop with that honest status.
8. **Finish:** Once npm is confirmed, close only still-open issues verifiably completed by merged PRs, with references. Record GitHub tag/release or docs only if the repo's approved release process explicitly calls for them; do not invent a release. Output five lines max: version + `latest` status; SHA; local checks; Node 22/24 CI; npm URL and any outstanding blockers/issues. No new milestone created automatically.

## Command usage

Use `gh`, `git`, `corepack pnpm`, `npm`, `node` and `tar`. Prefer `--json`/`--jq` and quiet commands to reading huge logs. Limit routine retries to one. Never make the user wait for unpublished work to be finished later; finish in the active session or state the exact blocker.
