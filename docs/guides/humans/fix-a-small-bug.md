# Fix a small bug

## Goal

Change as little as possible, prove it with a test, and leave docs honest.

## Steps

1. **Reproduce** — Prefer a failing test under root `tests/` with a fake `Transport` (no live network). See [`tests/README.md`](../../../tests/README.md).
2. **Find the owner** — Core request path lives under `packages/core/src/`; mocking under `packages/mocking/src/`. Read [`docs/architecture.md`](../../architecture.md) if the map is unclear.
3. **Fix the cause** — Reshape existing files before adding packages or layers. Stay inside the active milestone’s **In** scope when one is open (`versions/README.md`).
4. **Guard the fix** — Keep the new or updated test. Prefer several small cases over one vague assertion.
5. **Examples** — Only update [`examples/next`](../../../examples/next/) unless someone explicitly asked for another example app.
6. **Ship** — Open an issue and branch with `/plan-change`, then land with `/git-push` (or the same flow by hand). Story goes in [`docs/story.md`](../../story.md).

## Do not

- Invent backend endpoints the API never declared.
- Put React / Next / TanStack Query into `@apixa/core`.
- Rewrite a shipped `versions/vX.Y.Z/` folder for new features — open a new milestone instead.
- Leave planned APIs in examples as if they already work.
