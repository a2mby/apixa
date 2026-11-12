# v0.10.0 — Scope

## In scope

### Core (`@apixa/core`) — operation customization

- `operations` accepts, per key, one of:
  - a config object (today's `OperationDefinition` shape — method/path/headers/timeout/retry/hasBody)
  - a function `(ctx, ...args) => Promise<unknown>` — full custom resolution, still called as
    `api.resource.<name>(...)`
  - `false` — explicitly removes a built-in from the generated client
- Every key under `operations` — built-in or custom — surfaces identically at the call site:
  `api.resource.<name>()`. No difference in how a generated vs. hand-written operation is called.
- The `operations` object type suggests the resource's known operation names (16 total — original
  5 + the 11 below) as optional keys for autocomplete/override, while still accepting arbitrary
  custom string keys for fully custom operations.
- 11 new built-in operation conventions. **Revised during implementation:** these are **always-on**
  for any resource with a `path`, the same default-first treatment the original 5 have had since
  v0.2.0 — no `operations` entry is required to use them. (Originally scoped opt-in-only; changed
  per direct user request mid-implementation — see `docs/story.md`.) `false` still removes one;
  a developer's own object/function at that name still overrides the default:

| Name         | Basis                       | Default wire shape                      | Purpose                                                                 |
| ------------ | --------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `getBySlug`  | new route                   | `GET /slug/:slug`                       | lookup by slug instead of id                                            |
| `patch`      | new method on existing path | `PATCH /:id`                            | partial update (vs. `update`'s full replace)                            |
| `upsert`     | alias of `update`'s path    | `PUT /:id`                              | create-or-replace, same wire call as `update`                           |
| `count`      | new route                   | `GET /count`                            | row count, optionally filtered by `query`                               |
| `search`     | new route                   | `GET /search`                           | filter / free-text search                                               |
| `bulkCreate` | new route                   | `POST /bulk`                            | create many records in one call                                         |
| `bulkDelete` | new route                   | `DELETE /bulk`                          | delete many records in one call                                         |
| `getMany`    | new query convention        | `GET ""` with `id` query array          | batch-fetch by id list in one request                                   |
| `exists`     | composed (function)         | calls `getById`, maps 404 → `false`     | existence check, no new backend route assumed                           |
| `findFirst`  | composed (function)         | calls `getAll`, returns first or `null` | single-match lookup, no new backend route assumed                       |
| `getBy`      | composed (function)         | calls a given field/path + value        | general lookup by any custom field or path, no preset convention needed |

Exact method/path defaults and the function-context shape are locked in
[implementation-plan.md](./implementation-plan.md); all are overridable like any operation.

### Mocking (`@apixa/mocking`) — mirrored surface

- The same `operations` add / remove / override surface (object, function, or `false`) on mock
  resources — both the `mock: "<dataset-id>"` Core bridge and standalone `defineMockApi`. The 11
  new builtins are likewise always-on there (`true` is accepted as a harmless no-op for backward
  compatibility with an explicit enable).
- The 11 new builtins work against the in-memory store (no HTTP route assumptions needed — e.g. mock
  `search` does a naive field match over the seeded rows, mock `count` is the filtered row count,
  mock `getBy` looks up by any given field name).
- Function-style custom mock operations get read/write access to the resource's in-memory rows.

### Workspace deliverables

- Reshape `packages/core/src/operation/*` and `packages/core/src/types/definition.ts` — no new Core
  packages.
- Reshape `packages/mocking/src/resource.ts`, `mock-api.ts`, `bridge.ts`, `types.ts` to carry the same
  surface.
- Tests under `tests/core/` and `tests/mocking/` for: function operations, operation removal, each new
  builtin's default behavior, and the mirrored mock surface.
- `examples/frontends/next` updated to demonstrate at least one function operation and one of the 10 builtins.
- Docs: `docs/context.md`, `docs/architecture.md` (if the resolution pipeline shape changes),
  `docs/conventions.md` builtins table, `CHANGELOG.md`, `docs/story.md` completion note.

## Out of scope

| Item                                                                             | Why                                                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| OpenAPI import/export                                                            | Advanced ecosystem, unrelated                                                             |
| New workspace packages (`client`, `server`, `openapi`, …)                        | Not this milestone                                                                        |
| TanStack Query (`@apixa/tanstack-query`) API changes                             | Unrelated surface; `useResourceQuery` already accepts any resource shape                  |
| Schema validation                                                                | Still a planned hook, not required to add/remove operations                               |
| Live pagination/filter/sort conventions beyond `count` / `search` / `getMany`    | Broader convention set stays a later roadmap item                                         |
| Auth as a Core product surface                                                   | Unrelated                                                                                 |
| Rewriting shipped `versions/v0.1–v0.9` folders                                   | Historical; errata only                                                                   |
| Other `examples/*` (vue, vite, …)                                                | Next only                                                                                 |
| Route-collision resolution between builtins (e.g. a real id literally `"count"`) | Backend's responsibility; Apixa documents the assumption, doesn't solve ambiguous routing |

## Constraints (non-negotiable)

- No React / Next.js / TanStack Query in `@apixa/core`.
- The 11 new builtins are always-on for a resource with `path` — same default-first precedent as
  the original 5 (v0.2.0). `false` removes one by name; this is a deliberate extension of that
  precedent, not a departure from it (see `docs/story.md` for the direction-change note).
- A developer-defined operation (object or function) with a built-in's name always wins over the
  convention.
- Core does not embed the mock engine; the `@apixa/mocking` peer relationship (lazy register, no hard
  dependency) is unchanged.
- Function-style operations still return plain `Promise<T>` — no custom Promise wrapper.
- Planned ≠ implemented in docs.
