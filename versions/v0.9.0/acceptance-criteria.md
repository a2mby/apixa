# v0.9.0 — Acceptance criteria

Check every item before calling v0.9.0 done.

## API and types

- [x] `defineApi` resources accept `mock?: keyof MockDatasetIds | (string & {})` (dataset id string).
- [x] `mock: boolean` and `mockConfig` are removed from public Core types (`ResourceExtensions` and peer typings).
- [x] `pagination?: boolean` is a resource-level option next to `path` / `slice` / `mock`.
- [x] Known catalog ids autocomplete on `mock` when only `@apixa/core` is imported (no `@apixa/mocking` import required for suggestions).
- [x] `defineMockApi` accepts a string dataset id per resource and the existing `{ type, slice?, pagination? }` object form.

## Runtime behavior

- [x] A resource with `mock: "users-mock"` (and optional `slice` / `pagination`) is handled by `@apixa/mocking` the same way the old `mock: true` + `mockConfig` path was.
- [x] `pagination: true` on the resource yields the mock page envelope for list GET / `getAll` (including `previous` / `next` where already implemented).
- [x] Legacy `mock: true`, `mock: false`, and `mockConfig` throw clear config errors that name the new shape.
- [x] Empty or non-string `mock` values are rejected.
- [x] Core still does not embed the mock engine; peer install / lazy register remains required at runtime.

## Constraints

- [x] `@apixa/core` has no React, Next.js, or TanStack Query dependencies.
- [x] No new workspace packages for this milestone.
- [x] No new mock engine product features (delay, fail rate, custom handlers, persistence).
- [x] No `mock: { type }` object form on `defineApi` in this release.

## Example and docs

- [x] Next example uses string `mock` (+ resource `pagination` / `slice` where needed); no `mockConfig` / boolean `mock`.
- [x] `@apixa/mocking` README and root / living docs that described the old keys match the implemented syntax.
- [x] CHANGELOG records the breaking change.

## Tests

- [x] Tests cover string `mock`, resource `pagination`, `defineMockApi` string shorthand, and legacy rejection.
- [x] Relevant typecheck and test scripts pass.

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed or consciously waived with a note here.
- [x] [docs/story.md](../../docs/story.md) updated with a completion note.

Implementation-plan notes: all six steps completed. Internal peer transport specs flattened to `{ name, path, type, slice?, pagination? }` (no nested `mockConfig` on the wire). Import-side `MockDatasetIds` merges removed from mocking data modules for builtin ids (Core owns the filled list); custom-id merge pattern remains documented for apps.
