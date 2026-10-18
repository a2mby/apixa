---
description: Run npm run format before /git-push; format-only diffs outside Touches are allowed.
alwaysApply: true
---

# Format before `/git-push`

Before committing on a `/git-push` (after rebase onto latest `main`, before `git add` / `git commit`):

1. From the repo root, run `npm run format` (Prettier write over the whole tree).
2. Stage Touches-list files **and** any other files that Prettier changed.
3. Do **not** stop for Touches violations when the only extra diffs are formatting. Those are allowed.
4. Still stop for real (non-format) edits outside the issue Touches list — do not sneak in logic changes via format.

```bash
npm run format
git add <touches> <prettier-touched-files>
```

Do not skip format because “nothing looks dirty” — run it every `/git-push`.
