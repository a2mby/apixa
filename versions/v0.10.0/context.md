# v0.10.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Let a developer fully shape each resource's operations — add, remove, or override any of them,
using either a declarative config object or a plain function — on **both** live (`defineApi`) and
mocked (`@apixa/mocking`) resources, with zero extra ceremony at the call site: a custom `archive`
operation appears as `api.resource.archive()`, exactly like a built-in. Ship 11 new built-in
operation conventions — **always-on**, the same default-first treatment the original 5 have had
since v0.2.0 — so common needs (partial update, existence check, bulk writes, search, general
lookup-by-any-field via `getBy`, …) don't require writing a custom operation at all.

## Identity (this release)

- Packages: `@apixa/core` and `@apixa/mocking`
- Scope: operation customization surface, mirrored between live and mock resources
- No new workspace packages

## What success looks like

```ts
const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    entity: User,
    operations: {
      delete: false, // remove a built-in
      archive: (ctx, id: string) => ctx.request({ method: "POST", path: `/${id}/archive` }), // custom function op
    },
  },
});

await api.users.getBySlug("ada-lovelace"); // built in — no operations entry needed
await api.users.getBy("username", "ada"); // general lookup by any field
await api.users.archive("123"); // api.users.archive()
api.users.delete; // not present — removed
```

The same `operations` surface works on a `mock: "users-mock"` resource and inside `defineMockApi`.

## Principles that bind this release

1. **Default-first, extended** — the 11 new builtins are always-on for a resource with `path`, the
   same v0.2.0 precedent as the original 5. _(Revised from an initial opt-in-only design per
   direct user request mid-implementation — see `docs/story.md`.)_ `false` still removes one by
   name.
2. **Custom beats convention** — a developer-defined operation (object or function) with a built-in's
   name always wins.
3. **Native `Promise<T>`** — function-style operations still return a plain Promise; no new wrapper
   type.
4. **Framework-agnostic Core** — none of this touches React / Next.js / TanStack Query.
5. **Mocking stays an optional peer** — the same `operations` surface on mocked resources must not
   create a hard Core → mocking dependency.
6. **Docs honest about planned vs. implemented** — exact wire shape of each of the 11 builtins is
   locked in [implementation-plan.md](./implementation-plan.md), not invented ad hoc.

## Baseline in the repo today

- `operations` is a plain `Record<string, OperationDefinition>` config bag; every key is a method/path
  object, merged over 5 always-on CRUD conventions (`operation/expand.ts`, `operation/conventions.ts`).
- There is no way to remove a built-in, no function-style operation, and no type-level suggestion of
  known operation names.
- `@apixa/mocking`'s `createResource` is a fixed CRUD engine (`getAll`, `getById`, `create`, `update`,
  `patch`, `delete`) with no `operations` customization at all.

v0.10.0 **extends** both without discarding the existing pipeline, conventions, or mock engine.

## Non-goals for this folder

OpenAPI, new workspace packages, TanStack Query API changes, live pagination/filter/sort conventions
beyond what the 11 builtins need, auth, schema validation, resolving real-world route collisions
between a builtin's static path and a literal id value.

See [scope.md](./scope.md).
