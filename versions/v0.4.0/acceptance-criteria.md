# v0.4.0 — Acceptance criteria

## API and types

- [x] `defineApi<AppApi>()(config)` with resources-only `AppApi` (`path` + `entity`).
- [x] Root builtins (`baseURL`, `headers`, `transport`, `timeout`) typed by Core, not required on `AppApi`.
- [x] `entity: User` ⇒ `getAll(): Promise<User[]>`, `create(body: Omit<User,"id">)`, `update(..., Partial<User>)`.
- [x] No developer `create` / `update` keys needed on the state type.
- [x] `BuiltinHeaders` accepts common keys + custom header names.
- [x] Custom operation `response` / `query` / `body` in state refine that op.
- [x] `type`, `Type`, and `Infer` are not exported.
- [x] Positional call conventions unchanged; ops return native `Promise<T>`.

## Constraints

- [x] No React / Next / TanStack Query in Core.
- [x] No store/cache product surface.
- [x] No new packages or npm dependencies for this milestone.

## Example and docs

- [x] Next example is entity-only `AppApi` without `type()`.
- [x] README / living docs / CHANGELOG / story updated.

## Tests

- [x] State tests cover entity-only derive, BuiltinHeaders, missing entity ⇒ unknown bodies.
- [x] Prior transport tests still pass.
- [x] `pnpm typecheck` and `pnpm test` pass.

## Sign-off

- [x] Implementation-plan steps completed.
- [x] `docs/story.md` updated.
