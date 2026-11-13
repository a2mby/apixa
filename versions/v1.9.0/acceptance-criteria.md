# v1.9.0 — Acceptance criteria

Unchecked boxes are not inferred as passed.

## API

- [x] `pagination: "page" | "cursor"` still compiles and behaves as before.
- [x] `pagination: { type, preset }` is accepted and typed for `laravel`, `laravel-paginator`, `strapi`, `payload` and `nestjs`; the runtime list and the public type are tested to stay in sync.
- [x] `pagination: { type, fields, params }` is accepted; `preset` with `fields` is a `ConfigError`.
- [x] `parseList` is accepted. Its return type is not checked against the page contract (typed `unknown`); the runtime check requires an object with a `data` array.
- [ ] `getAll` is typed as `PaginatedListOf` for every form (type-tested for the preset form only; `fields`/`parseList`/cursor forms not yet type-tested).

## Runtime

- [x] A live Laravel-shaped body returns `{ data, total, page, pageSize }`.
- [x] A live cursor-shaped body returns `{ data, nextCursor }`.
- [x] `pageSize`/`page`/`cursor` query keys are renamed per `params`.
- [x] A missing or wrong-typed mapped field throws `ParseError` naming the resource and path.
- [x] String form on a live resource passes the body through unchanged (decision revised: validating it broke an existing test and current consumers).
- [x] Mock output is unchanged.

## Constraints

- [x] No backend-specific code outside the preset data table.
- [x] No new package or dependency; Core stays framework-agnostic.
- [x] A resource without the new config behaves exactly as before.

## Example / docs

- [ ] Blocked until a release (the example resolves published `apixa@2.0.0`): `nextjs-products` reads `getAll()` as a page with no manual envelope handling and loads against the Laravel backend.
- [ ] `docs/conventions.md` describes the forms and the error (done); `docs/public-api.md` has no pagination section and is not updated.
- [ ] Every later DX/bug item has an entry in the plan and a test.

## Tests

- [x] Failing-first tests for each runtime item above; `pnpm verify` passes.

## Sign-off

- [ ] Owner sign-off (recorded only when the owner states it).
