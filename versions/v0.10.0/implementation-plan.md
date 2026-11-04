# v0.10.0 — Implementation plan

Smallest path to let operations be added, removed, or overridden — as an object or a function — on
both live and mocked resources, plus 11 new always-on builtins. Prefer reshape over new packages.

> **Direction change during implementation:** the 11 new builtins were originally scoped as
> opt-in-only (design decision 3 below, struck through). The user explicitly asked mid-implementation
> for them to be always-on "like getAll getById update delete create," and to add a general `getBy`
> escape hatch. Both are implemented; design decision 3 and the suggested-keys/mock sections are
> updated to match. See `docs/story.md` for the direction-change note.

## Design decisions to lock while coding

1. **Operation value union.** `OperationState` (and the runtime `OperationDefinition` bag) becomes a
   discriminated union: `OperationConfig | OperationFn | false`. `false` means "do not generate this
   operation" — `expandOperations` must drop the key entirely rather than emit an empty config.
2. **Function signature.** `type OperationFn = (ctx: OperationFnContext, ...args: unknown[]) =>
Promise<unknown>`, where `OperationFnContext` exposes a bound `request(partial)` helper
   (`partial` = `Partial<OperationDefinition> & { params?, query?, body? }`) that still runs through
   the normal pipeline — headers inheritance, retry, middleware, error classification — so a custom
   function operation is not forced to reimplement `executeRequest` from scratch. The internal
   composed builtins (`exists`, `findFirst`, `getMany`, `getBy`) are implemented using this same
   mechanism, not a private shortcut.
3. ~~New builtins are opt-in, not auto-expanded.~~ **Revised: new builtins are always-on, same as
   the original 5.** `expandOperations` always includes all 16 names (minus any set to `false`),
   consistent with the v0.2.0 default-first precedent — no `operations` entry is required to use
   them. A name is only absent when explicitly removed with `false`.
4. **Suggested-keys typing.** Resource `operations` type becomes roughly
   `Partial<Record<AllBuiltinOpName, OperationConfig | OperationFn | false>> & Record<string,
OperationConfig | OperationFn | false>` so editors suggest the 16 known names first while still
   accepting arbitrary custom keys. `AllBuiltinOpName` is the union of the 5 original + 11 new
   convention names.
5. **Mock mirror.** `@apixa/mocking`'s `MockResource` / `createResource` gains the same `operations`
   bag, applied against the in-memory `rows` state instead of a transport call, and the same
   always-on treatment for all 16 names. The Core `mock: "<dataset-id>"` bridge
   (`peer-mocking.ts` → `@apixa/mocking/register`) passes the resource's `operations` through
   unchanged so both entry points share one implementation.
6. **Default wire shapes** for the 7 new route-based builtins (`getBySlug`, `patch`, `upsert`,
   `count`, `search`, `bulkCreate`, `bulkDelete`) live in a new convention table, separate from
   `CONVENTION_DEFAULTS`, consulted by `resolveOperation` as a fallback. 4 are composed functions
   (`exists`, `findFirst`, `getMany`, `getBy`) — no static method/path, since `getBy` in particular
   takes its path/field per call.
7. **Removal applies uniformly.** `operations: { delete: false }` removes a built-in on both live and
   mock resources; removing a custom-only name is a no-op (nothing to remove).

## Target developer surface

```ts
const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    entity: User,
    operations: {
      delete: false,
      getBySlug: { path: "/by-slug/:slug" }, // override the default path
      archive: (ctx, id: string) => ctx.request({ method: "POST", path: `/${id}/archive` }),
    },
  },
});

await api.users.patch("123", { name: "Ada" }); // built in, no operations entry needed
await api.users.getBySlug("ada-lovelace"); // override applied
await api.users.getBy("username", "ada"); // general lookup by any field
await api.users.archive("123"); // fully custom operation
```

```ts
const mockApi = defineMockApi({ users: "users-mock" });

await mockApi.users.count(); // built in, no operations entry needed
```

Exact helper names (`ctx.request`) may change slightly during implementation; keep the shape — bound
helper + raw args — and document the final form in README / docs.

## Ordered steps

### 1. Core types

Files: [`packages/core/src/types/definition.ts`](../../packages/core/src/types/definition.ts), new
`packages/core/src/types/builtins.ts`

- Add `OperationFn`, `OperationFnContext`, `BuiltinOpName` union, `false` branch on
  `OperationState` / `OperationDefinition`.
- Update `ResourceState.operations` / `ResourceRuntimeInput.operations` to the suggested-keys shape.

### 2. New convention table

File: [`packages/core/src/operation/conventions.ts`](../../packages/core/src/operation/conventions.ts)
(or a new sibling `extended-conventions.ts`)

- Add the 7 new route-based defaults, kept separate from `CONVENTION_DEFAULTS` so the always-on 5 are
  untouched.

### 3. Expansion + removal

File: [`packages/core/src/operation/expand.ts`](../../packages/core/src/operation/expand.ts)

- Only expand a new-builtin name when referenced in `operations`.
- Drop any name whose value is `false`.

### 4. Resolution for function operations

Files: [`packages/core/src/operation/resolve.ts`](../../packages/core/src/operation/resolve.ts),
[`packages/core/src/operation/create-fn.ts`](../../packages/core/src/operation/create-fn.ts)

- Branch: config object → existing `resolveOperation` + `parseOperationArgs` + `executeRequest` path
  (unchanged). Function → wrap directly, passing `OperationFnContext` (with bound `request()`) plus
  the raw call args.
- Implement `exists` and `findFirst` as functions using this same path (design decision 2) — no
  private shortcut.

### 5. Resource client wiring

File: [`packages/core/src/api/resource-client.ts`](../../packages/core/src/api/resource-client.ts)

- Build the client from whichever shape `expandOperations` produced per key; identical
  `client[name] = fn` assignment regardless of config/function origin.

### 6. Mocking mirror

Files: [`packages/mocking/src/resource.ts`](../../packages/mocking/src/resource.ts),
[`packages/mocking/src/types.ts`](../../packages/mocking/src/types.ts),
[`packages/mocking/src/mock-api.ts`](../../packages/mocking/src/mock-api.ts),
[`packages/mocking/src/bridge.ts`](../../packages/mocking/src/bridge.ts)

- Extend `MockResource` / `createResource` with the same `operations` bag, implemented against
  `rows` / `state()`.
- Implement the 11 builtins as pure data operations (no HTTP assumptions), always-on same as the
  original 6: `count` → filtered length, `search` → naive field match, `bulkCreate` /
  `bulkDelete` → loop existing `create` / `delete`, `upsert` → `update` if found else `create`,
  `getBySlug` → find by `slug` field, `getBy` → find by any given field name, `getMany` → map of
  `getById`, `exists` / `findFirst` → composed over `getById` / `getAll`.
- `defineMockApi` resource config and the Core `mock: "<id>"` bridge both accept `operations`.

### 7. Tests

Location: [`tests/core/`](../../tests/core/), [`tests/mocking/`](../../tests/mocking/)

- One function-operation test, one removal (`false`) test, one test per new builtin's default wire
  shape (Core), one test per new builtin against the mock store, one mixed override test (custom
  config beats convention), one suggested-keys type test (compile-time check).

### 8. Example + docs

- `examples/next`: add one function operation and one builtin to the existing resource.
- `docs/context.md`, `docs/conventions.md` (builtins table), `docs/architecture.md` if the resolution
  branch is worth documenting, `CHANGELOG.md`, `docs/story.md` completion entry.

## Explicit non-steps

- Do not add OpenAPI, new packages, or TanStack Query changes.
- Do not solve real-world route collisions between a builtin's static path segment and a literal id
  value — document the assumption instead.
- Do not rewrite shipped `versions/v0.1–v0.9` folders.

## Suggested file touch list

| Path                                                                                              | Action                                                                  |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/core/src/types/definition.ts`                                                           | Operation value union, suggested-keys `operations` type                 |
| `packages/core/src/types/builtins.ts`                                                             | New — `BuiltinOpName`, `OperationFn`, `OperationFnContext`              |
| `packages/core/src/operation/conventions.ts`                                                      | New builtins' default method/path table                                 |
| `packages/core/src/operation/expand.ts`                                                           | Opt-in expansion for new builtins; drop `false` entries                 |
| `packages/core/src/operation/resolve.ts`                                                          | Branch config vs. function                                              |
| `packages/core/src/operation/create-fn.ts`                                                        | Function-operation call path; bound `ctx.request()`                     |
| `packages/core/src/operation/builtins.ts`                                                         | New — `exists` / `findFirst` composed implementations                   |
| `packages/core/src/api/resource-client.ts`                                                        | Uniform wiring regardless of operation origin                           |
| `packages/core/src/index.ts`                                                                      | Export new types                                                        |
| `packages/mocking/src/resource.ts`                                                                | Mirrored `operations` surface + 11 always-on builtins on in-memory rows |
| `packages/mocking/src/types.ts`                                                                   | Mock-side operation types                                               |
| `packages/mocking/src/mock-api.ts`                                                                | `defineMockApi` accepts `operations`                                    |
| `packages/mocking/src/bridge.ts`                                                                  | Pass `operations` through the Core peer bridge                          |
| `tests/core/operations-customization.test.ts`                                                     | New                                                                     |
| `tests/core/operations-builtins.test.ts`                                                          | New                                                                     |
| `tests/mocking/operations-customization.test.ts`                                                  | New                                                                     |
| `examples/next/lib/api.ts`                                                                        | Demonstrate one function op + one builtin                               |
| `docs/context.md`, `docs/conventions.md`, `docs/architecture.md`, `CHANGELOG.md`, `docs/story.md` | Honesty pass + completion note                                          |

## Done when

All items in [acceptance-criteria.md](./acceptance-criteria.md) pass.
