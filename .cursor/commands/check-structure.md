---
description: Audit Apixa docs/versions/packages layout against project conventions
---

The developer wants a structure check. Do not implement features. Report only.

## Read

- `docs/conventions.md`
- `versions/README.md`
- `.cursor/rules/apixa-core.mdc`
- Tree: `docs/`, `versions/`, `packages/`, `examples/`, `tests/`

## Checklist

Report pass/fail for each:

1. Living docs present: `context.md`, `architecture.md`, `roadmap.md`, `conventions.md`, `story.md`, `decisions/` with at least ADRs 001–002.
2. No duplicate living `context.md` at repo root.
3. `versions/README.md` names exactly one **Current** version.
4. Current version folder has all four filled files: `context.md`, `scope.md`, `implementation-plan.md`, `acceptance-criteria.md`.
5. No empty future version folders (folders with missing or stub-only files).
6. Only packages that belong today exist under `packages/` (Core-only until a version scope says otherwise).
7. `examples/basic/` exists.
8. `tests/` exists (README at minimum).
9. `docs/context.md` milestone banner points at the current version folder.
10. Planned packages are documented as future, not created early.

## Reply

```markdown
## Structure check

Current version: vX.Y.Z

Pass:

- …

Fail:

- … (how to fix)

Next command: /implement-version | /start-version | /plan-change
```

Do not auto-fix Fail items unless the brief also said to fix them.
