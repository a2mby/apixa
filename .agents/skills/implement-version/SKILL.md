---
name: implement-version
description: "Implement the active Apixa versions/vX.Y.Z coding contract"
---

The developer wants coding against the active milestone. Optional words after `/implement-version` narrow the step (for example `defineApi` or `tests`).

## Stop first

Read `versions/README.md` and open the **Current** version folder. If none, stop and tell them to run `/start-version` first.

Read that folder’s `context.md`, `scope.md`, `implementation-plan.md`, and `acceptance-criteria.md`.

Read `docs/context.md`. Do not recap the project.

If the brief asks for something in **Out** of scope, stop and name it. Suggest `/start-version` or a roadmap update instead of sneaking it in.

## Work order

1. Follow `implementation-plan.md` in order. Skip only with an explicit note in chat and in the plan/acceptance file.
2. Stay inside `scope.md` In.
3. Reshape existing Core files before adding files; do not add new packages unless scope says so.
4. Keep public exports minimal and honest.
5. Update `examples/frontends/basic` to **implemented** API only.
6. Add/adjust tests under `tests/` with fake/injectable transport.
7. Check off items in `acceptance-criteria.md` when evidence exists (tests, typecheck, example).
8. When the milestone advances or completes, append `docs/story.md` (newest first). Update living docs only if principles or architecture changed.

## Hard refusals

- React / Next / TanStack Query in Core
- Production `mocks` product API on Core config (unless this version’s scope explicitly includes a separate mocking approach)
- Aspirational README/example syntax
- Empty future version folders
- Editing a different version’s frozen folder for new work

## Reply while working

Name the version, the plan step you are on, and which acceptance items you expect to check. When done, list remaining unchecked acceptance criteria.
