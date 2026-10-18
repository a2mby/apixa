# v0.3.0 — Acceptance criteria

Check every item before calling v0.3.0 done.

## API and types

- [x] `type<T>()` returns `Type<T>`; `Infer<Type<T>>` is `T`.
- [x] `OperationDefinition.body` and `response` accept `Type<…>` markers (optional fields).
- [x] Inference: op with `response: type<User[]>()` yields `Promise<User[]>`.
- [x] Inference: op with `body: type<Create>()` yields a body argument of type `Create`.
- [x] Missing `response` marker yields `unknown` (or equivalent untyped payload).
- [x] `type`, `Type`, and `Infer` are exported from `@apixa/core` next to `defineApi`.
- [x] `{} as User` (non-`Type` value) is not assignable to `body` / `response`.
- [x] Positional call conventions / path arity remain unchanged.
- [x] Operations return native `Promise<T>` (unwrapped data).

## Constraints

- [x] No React / Next / TanStack Query in `@apixa/core`.
- [x] No new packages under `packages/`.
- [x] No new npm dependencies for this milestone.
- [x] No runtime schema library.
- [x] Frozen `versions/v0.1.0/` and `versions/v0.2.0/` not rewritten for new features.
- [x] The only intentional marker cast is inside `type<T>()`.

## Example and docs

- [x] Example definitions use `type<T>()` (not `{} as T`).
- [x] README / living docs describe the marker helper.
- [x] Changelog entry documents the breaking change from `{} as T`.
- [x] Follow-ups (`crud<>()`, path-param inference) marked planned, not implemented.
- [x] `docs/story.md` notes v0.3.0 progress/completion.

## Tests

- [x] Type tests cover `type` / `Infer` happy path and rejection of `{} as T` on markers.
- [x] Prior success/error transport tests still pass.
- [x] `pnpm typecheck` and `pnpm test` pass.

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed or waived with a note here.
- [x] [docs/story.md](../../docs/story.md) updated.
