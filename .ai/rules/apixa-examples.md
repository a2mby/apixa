---
description: Rules for postponed templates, internal browser fixtures, and ignored manual-testing apps
globs: templates/**/*,tests/fixtures/**/*
alwaysApply: true
---

# Templates, internal fixtures, and manual testing

Framework-specific starter templates under **`templates/`** are intentionally postponed until Apixa
reaches a stable API; only **`templates/README.md`** belongs in `templates/`.
Internal browser/SSR verification uses **`tests/fixtures/browser-next`** (driven by
`pnpm verify:browser`). Local manual-testing apps and experiments belong under **`manual-testing/`**
(gitignored).

## Allowed

- `templates/README.md` (postponement notice)
- `tests/fixtures/browser-next/**` (internal Next.js App Router fixture for `pnpm verify:browser`)
- Root docs / README that mention postponed `templates/` or `manual-testing/`

## Keep separated

- Never restore `examples/` or add unrequested framework templates or playgrounds under `templates/`.
- Never commit files under `manual-testing/` (it is gitignored).
- Keep internal verification fixtures aligned with **implemented** Apixa APIs only.
