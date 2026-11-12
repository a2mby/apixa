# v0.10.0 — Acceptance criteria

Check every item before calling v0.10.0 done.

> **Direction change during implementation:** the 11 new builtins (10 originally scoped + `getBy`,
> added mid-implementation) were revised from opt-in-only to **always-on**, per direct user
> request — see `docs/story.md`. Criteria below reflect what shipped, not the original opt-in
> framing.

## API and types

- [x] A resource's `operations` accepts a config object, a function, or `false` per key.
- [x] A custom function operation appears at the call site exactly like a built-in:
      `api.resource.<name>()`.
- [x] Setting a built-in to `false` removes it from the generated client (not present, not
      `undefined`-callable).
- [x] The 11 new builtins are present by default on any resource with a `path` — the same
      default-first treatment as the original 5 since v0.2.0 — with no `operations` entry
      required.
- [x] A developer-defined operation (object or function) with a built-in's name overrides the
      convention.
- [x] `operations` suggests the resource's known operation names (5 original + 11 new = 16) via
      `OperationsBag<V>` (`Partial<Record<AllBuiltinOpName, V>> & Record<string, V>`), while
      arbitrary custom keys remain valid.
- [x] Function operations return plain `Promise<T>` and flow through the same error classification as
      config-object operations (via the bound `ctx.request()` helper).

## Builtins

- [x] `getBySlug`, `patch`, `upsert`, `count`, `search`, `bulkCreate`, `bulkDelete` each have a
      documented default method/path, overridable like any operation.
- [x] `exists`, `findFirst`, and `getMany` are implemented via the function mechanism (no private
      shortcut), composed over `getById` / `getAll`.
- [x] `getBy(fieldOrPath, value)` is a general lookup escape hatch (added mid-implementation, user
      request): a `:placeholder` in the first argument interpolates the value; otherwise the value
      is appended as a path segment. No preset convention needed for a one-off custom key.

## Mocking mirror

- [x] The same `operations` add/remove/override surface works on a `mock: "<dataset-id>"` Core
      resource — operation generation is transport-agnostic, so `mock` only swaps the transport.
- [x] The same surface works on a standalone `defineMockApi` resource.
- [x] All 11 builtins are present by default against `defineMockApi`'s in-memory store (no HTTP
      route assumptions — they're pure data operations). Against a `mock: "<dataset-id>"` Core
      resource, `patch` / `upsert` work for free (they reuse the already-simulated `/:id` route);
      the remaining 5 route-based builtins (`getBySlug`, `count`, `search`, `bulkCreate`,
      `bulkDelete`) 404 the same way they would against a real backend that hasn't implemented
      that route — documented, not silently papered over (see `docs/conventions.md`). The 4
      composed ones (`exists`, `findFirst`, `getMany`, `getBy`) work against the Core mock bridge
      too, since they only rely on the already-simulated `getById` / `getAll` wire shapes.
- [x] A custom function mock operation can read and write the resource's in-memory rows.

## Constraints

- [x] `@apixa/core` has no React, Next.js, or TanStack Query dependencies.
- [x] No new workspace packages created for this milestone.
- [x] `@apixa/mocking` remains an optional peer — no hard Core dependency introduced.
- [x] The 11 new builtins extend the v0.2.0 default-first precedent rather than inventing a new
      kind of assumption — calling a route-based one against an unimplemented backend route 404s,
      same as calling any other unconfigured endpoint.

## Example and docs

- [x] `examples/frontends/next` demonstrates a built-in available with no `operations` entry (e.g. `exists`,
      `patch`) and one fully custom function operation (`archive`).
- [x] `docs/conventions.md` documents the full builtin table (16 names) and the function-operation
      shape.
- [x] Planned-vs-implemented stays honest across `docs/context.md`, `docs/architecture.md`,
      `CHANGELOG.md`.

## Tests

- [x] Root tests cover: function operations, operation removal, each new builtin's default behavior
      (Core), the mirrored mock surface, override precedence, and the always-on direction change
      (`tests/core/operations-customization.test.ts`, `tests/core/operations-builtins.test.ts`,
      `tests/mocking/operations-customization.test.ts`, plus updated assertions in
      `tests/core/default-operations.test.ts`, `tests/core/define-api.test.ts`,
      `tests/mocking/mock-api.test.ts`).
- [x] Tests use an injectable/fake `Transport` for Core cases — no live network requirement.
- [x] `pnpm typecheck` and `pnpm test` (188 tests, 27 files) pass.

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed; design decision 3
      (opt-in) revised to always-on mid-implementation per user request — noted inline, not
      silently changed.
- [x] [docs/story.md](../../docs/story.md) updated with a completion note covering the direction
      change.
