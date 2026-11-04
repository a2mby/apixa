# v0.11.0 — Scope

## In scope

### Bug fixes (Core)

1. **Parse failures throw, not silently succeed.** `transport/fetch.ts` / `transport/read-body.ts`:
   a `JSON.parse` failure on a `application/json`-declared body throws `ParseError` (already
   exported, currently dead code) instead of returning `status: 200, body: null`.
2. **Composed builtins delegate to resolved operations.** `operation/builtins.ts`'s `exists` and
   `findFirst` (and `getMany`, `getBy` where applicable) call the resource's actually-resolved
   `getById` / `getAll` client functions instead of hardcoding `/:id` / `""` wire shapes, so a
   developer's override of `getById`/`getAll` is honored by everything composed on top of it.
3. **`findFirst` / `getMany` handle a paginated `getAll` envelope.** When a resource's documented
   `list` override makes `getAll` return `{ data, total, page }` instead of a bare array,
   `findFirst` reads `.data` for its first-match search and `getMany`'s declared
   `Promise<EntityOf<R>[]>` return type stays accurate at runtime.
4. **`decideRetry` is computed once per attempt, not twice.** `request/execute.ts`: compute the
   retry decision once, reuse it for both the `HttpError.retryable` metadata and the actual retry
   branch, so a `shouldRetry` hook with a side effect (logging/metrics) fires once per attempt, not
   twice.
5. **`defineApi` validates resource shape.** A top-level key with no (or non-string) `path` throws a
   clear "resource '<key>' is missing path" error at `defineApi()` call time instead of silently
   producing a broken client, on both overloads.
6. **Stale pre-pivot comment removed.** `operation/conventions.ts`'s header comment describing the
   extended builtins as opt-in-only is corrected to describe the actual always-on behavior.

### Bug fixes (Mocking)

7. **Core's `mock: "<id>"` bridge stops leaking live store references.** `mocking/src/store.ts`
   clones records/rows on every read the same way `resource.ts` already does, so
   `const u = await api.users.getById(1); u.name = "x"` can no longer mutate the shared in-memory
   dataset.
8. **The Core mock bridge gains the same `operations` override mechanism `defineMockApi` already
   has.** A resource using `mock: "<id>"` can add/remove/override an operation exactly like a
   `defineMockApi` resource can — closing the capability gap between the two mock entry points.

### Improvements (all "fits cleanly" per the originating analysis)

9. **Opt-in `pagination` convention for live `getAll`.** A resource may declare
   `pagination: "page" | "cursor" | false` (default `false` — zero behavior change unless
   declared). When set, `getAll`'s query/response types and default wire shape follow a typed
   envelope (`{ data, total, page, pageSize }` for `"page"`; `{ data, nextCursor }` for `"cursor"`)
   instead of a bare array.
10. **`readOnly` resource shorthand.** `readOnly: true` on a resource is sugar for
    `operations: { create: false, update: false, patch: false, upsert: false, delete: false,
bulkCreate: false, bulkDelete: false }` — one line instead of seven for a read-only resource.
    An explicit `operations` entry for any of those names still overrides the shorthand.
11. **`@apixa/tanstack-query` covers all 16 builtins.** `ResourceLike` / inference types recognize
    every builtin name; `useResourceQuery` wires query/mutation state for the 11 new ones the same
    way it already does for the original 5. Where an operation doesn't fit the list/entity mutation
    shape cleanly (e.g. `count`, `search` as a parameterized query), it's exposed as a typed
    query/mutation consistent with the others — no bespoke one-off API per operation.
12. **Mock engine lookups are index-backed.** `@apixa/mocking`'s `resource.ts` builds an id→row
    `Map` once at `seed()`/load time; `getById`, `exists`, `update`, `patch`, `delete` use it instead
    of a linear scan. No API change, no behavior change — internal only.

### Workspace deliverables

- Reshape `packages/core/src/{transport,operation,request,api}/*` — no new Core packages.
- Reshape `packages/mocking/src/{store.ts,resource.ts,bridge.ts}` — no new mocking packages.
- Extend `packages/tanstack-query/src/{types.ts,use-resource-query.ts}` for full builtin coverage.
- Tests under `tests/core/`, `tests/mocking/`, and `tests/tanstack-query/` (or wherever that
  package's tests currently live) covering every fix and every improvement above, including a
  regression test per bug (parse failure, store mutation, composed-builtin override, double retry,
  missing-path validation).
- `examples/next` updated only if an existing example resource is a natural fit for demonstrating
  `readOnly` or `pagination`; do not add a resource solely to showcase a feature.
- Docs: `docs/context.md`, `docs/conventions.md` (pagination + readOnly + corrected builtins table
  note), `docs/architecture.md` if the mock-bridge operations plumbing changes its shape,
  `CHANGELOG.md`, `docs/story.md` completion note.

## Out of scope

| Item                                                              | Why                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI import/export                                             | Advanced ecosystem, unrelated                                                                                                                   |
| New workspace packages                                            | Not this milestone                                                                                                                              |
| Schema validation hooks                                           | Roadmap "Later" item; tagged "tension with a stated principle" in the analysis — needs its own deliberate scope, not bundled into a fix release |
| Operation `deprecated` / versioning metadata                      | Premature per "no abstractions before needed"; belongs with the real v1.0.0 API-versioning roadmap item                                         |
| Request deduplication / in-flight coalescing                      | Belongs in `@apixa/tanstack-query` as its own scoped feature, not a side effect of a fix release                                                |
| Auth as a Core product surface                                    | Unrelated                                                                                                                                       |
| Dataset catalog codegen (`datasets/manifest.json` → `catalog.ts`) | Real improvement, but a workspace/tooling change, not a library-surface fix — defer to its own pass                                             |
| Bundle-size subpath split (mock-only Core export)                 | Needs a measurement pass first; speculative until profiled                                                                                      |
| Rewriting shipped `versions/v0.1–v0.10` folders                   | Historical; this version corrects behavior, not history — v0.10.0's docs get a pointer forward, not a rewrite                                   |
| Other `examples/*` (vue, vite, …)                                 | Next only                                                                                                                                       |

## Constraints (non-negotiable)

- No React / Next.js / TanStack Query in `@apixa/core`.
- `pagination` is opt-in and produces no behavior change when absent — same "no silent invention"
  discipline as every other convention.
- A developer-defined operation (object or function) with a built-in's name always wins over the
  convention — including for anything a composed builtin calls internally (this is the bug being
  fixed).
- Core does not embed the mock engine; the `@apixa/mocking` peer relationship (lazy register, no
  hard dependency) is unchanged.
- Function-style operations still return plain `Promise<T>` — no custom Promise wrapper.
- Planned ≠ implemented in docs.
- This version does not ship any net-new user-facing concept beyond what's listed in "In scope"
  above — everything here is either a fix or an already-analyzed, already-approved improvement.
