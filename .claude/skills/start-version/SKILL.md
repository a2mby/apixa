---
name: start-version
description: "Create a filled versions/vX.Y.Z coding contract for a new Apixa milestone"
---

The developer is starting a new milestone. The words after `/start-version` are the version (for example `0.2.0`) plus an optional one-line goal. Do **not** write package code in this command.

## Stop first

Stop and ask for the version if it is missing or not `X.Y.Z`.

Stop if `versions/vX.Y.Z/` already exists. Name the path. Do not overwrite.

Stop if they ask to stub several future versions at once. Only create **one** next milestone.

Read `docs/context.md`, `docs/roadmap.md`, and `versions/README.md`. Do not recap the project.

## Create the folder

Create exactly:

```text
versions/vX.Y.Z/
  context.md
  scope.md
  implementation-plan.md
  acceptance-criteria.md
```

Fill all four with real content (no empty placeholders). Use `versions/v0.1.0/` as the template for sections and tone.

### context.md

Frozen subset: goal for this release, what success looks like, principles that bind this release, what is intentionally out.

### scope.md

Explicit **In** and **Out** tables. Package list must match reality. If Core-only, say so. Do not sneak in TanStack Query / OpenAPI / new packages unless this milestone’s roadmap bullet requires them.

### implementation-plan.md

Ordered smallest path. Prefer reshape over new packages. Include design decisions to lock, file touch list, and explicit non-steps.

### acceptance-criteria.md

Checkboxes that can gate “done”: API, runtime, constraints, example/docs, tests, sign-off.

## Update pointers

1. Set **Current** in `versions/README.md` to `vX.Y.Z` (mark previous as completed if shipped).
2. Point the milestone banner at the top of `docs/context.md` to `versions/vX.Y.Z/`.
3. Ensure `docs/roadmap.md` has a heading for this version that matches the new scope.
4. Append a short kickoff entry to `docs/story.md` (newest first).

Do **not** create sibling empty version folders.

## Reply

Give the path `versions/vX.Y.Z/`, the goal in one sentence, and the In-scope bullets. Then wait. Do not start implementation unless the brief also said to implement now.
