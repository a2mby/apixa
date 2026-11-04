# v0.11.0 — Implementation plan

Smallest path to fix every bug the post-v0.10.0 analysis found and ship the short list of
already-approved improvements, before v1.0.0 planning starts. Prefer reshape over new packages.

## Design decisions to lock while coding

1. **`ParseError` on parse failure.** `read-body.ts` currently returns `null` on a caught
   `JSON.parse` throw; instead it rethrows as `ParseError` (cause = original error, with the raw
   text truncated in the message for debuggability). `fetch.ts`'s caller lets this propagate rather
   than catching it into a `200/null` response.
2. **Composed builtins take resolved operation functions as dependencies, not conventions.**
   `COMPOSED_BUILTINS` construction changes from a static `Record<string, OperationFn>` to a
   factory that receives the already-built `getById`/`getAll` client functions for the resource
   (built earlier in `resource-client.ts`'s construction order) and calls _those_, so an override
   propagates automatically. `exists` catches an error from calling `getById` and classifies 404 →
   `false`, same as today; `findFirst` calls `getAll` and reads `.data` when the result isn't a bare
   array (design decision 3).
3. **Envelope-aware `findFirst`/`getMany`.** A small shared helper
   `toArray(result: unknown): unknown[]` normalizes `Array.isArray(result) ? result : (result as
{ data?: unknown[] })?.data ?? []`, used by both. This stays local to `builtins.ts` — not a new
   public export.
4. **Single retry decision per attempt.** `request/execute.ts`'s retry branch computes
   `const decision = decideRetry(...)` once per failed attempt; both the `HttpError.retryable` flag
   and the loop's retry/stop branch read from that one `decision` value.
5. **Resource shape validation at `defineApi()` call time.** In `api/define-api.ts`, right where
   top-level keys are classified as resources, assert `typeof value.path === "string"` and throw a
   descriptive `Error` (not a custom error class — this is a developer-time config mistake, not a
   runtime API error) naming the offending key if it fails. Applies to both overloads since both
   funnel through the same runtime construction path.
6. **Mock bridge cloning matches `resource.ts`.** `store.ts`'s list/get handlers return
   `structuredClone(...)` (or the project's existing clone helper, check `resource.ts` for which it
   already uses) instead of the live array/row reference. `response.ts` is checked for the same
   issue on its return path.
7. **Mock bridge gains `operations`.** `bridge.ts` (or wherever `mock: "<id>"` resources are wired)
   is extended to accept and pass through the same `operations` bag `defineMockApi`'s resources
   accept, reusing `resource.ts`'s existing override-resolution logic rather than duplicating it —
   the two entry points should call into one shared implementation, not grow two.
8. **`pagination` convention.** New resource-level field `pagination?: "page" | "cursor" | false`
   (default `false`). When set, it changes `getAll`'s resolved query param shape and response type
   only — implemented as a convention-table entry alongside `CONVENTION_DEFAULTS`, not a new code
   path through `expand.ts`. No pagination metadata is invented or parsed from a response the
   developer hasn't told Apixa to expect; this only shapes types + the request's query params.
9. **`readOnly` shorthand.** Resolved once in `expand.ts`/wherever `operations` is first read for a
   resource: if `resource.readOnly === true`, seed the removal set with the 7 write-op names before
   applying `false`/overrides from `operations`, so an explicit `operations` entry for any of those
   names still wins (removal set is a default, not a hard mask).
10. **TanStack Query coverage.** `tanstack-query/src/types.ts`'s `ResourceLike` and the associated
    `Infer*` helpers are extended to the full `AllBuiltinOpName` set (reuse Core's exported type,
    don't redefine it). `use-resource-query.ts` gains generated query/mutation entries for the 11
    new builtins following the existing pattern for the original 5 (list-shaped ops get query
    treatment via `queryKey` + `queryFn`; mutating ops get `useMutation` + invalidate-on-success,
    consistent with the "correctness-first invalidation" default already documented).
11. **Index-backed mock lookups.** `resource.ts` builds a `Map<Id, number>` (id → array index) at
    seed time alongside the existing `rows` array; `locate()`/equivalent reads from the map first,
    falling back to nothing (no linear scan) for `getById`/`exists`/`update`/`patch`/`delete`. The
    map is rebuilt (or incrementally maintained) on `create`/`delete` to stay consistent.

## Target developer surface

```ts
const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    readOnly: false,
    pagination: "page",
    operations: {
      getById: { path: "/u/:id" }, // override
    },
  },
});

const page = await api.users.getAll({ page: 1, pageSize: 20 }); // typed envelope
await api.users.exists("123"); // now calls the overridden getById at /u/:id, not /:id
```

```ts
const mockApi = defineMockApi({
  users: { type: "users-mock", operations: { archive: (ctx, id) => ctx.request(...) } },
});
```

```tsx
const users = useResourceQuery(api.users, { queryKey: ["users"] });
await users.patch(id, { name: "Ada" });
users.mutations.search.isPending;
```

Exact field/type names above may change slightly during implementation; keep the shape and document
the final form in docs/conventions.md.

## Ordered steps

### 1. Parse-failure fix

Files: [`packages/core/src/transport/read-body.ts`](../../packages/core/src/transport/read-body.ts),
[`packages/core/src/transport/fetch.ts`](../../packages/core/src/transport/fetch.ts)

- Rethrow as `ParseError` instead of swallowing; add a regression test with a mocked
  malformed-JSON response.

### 2. Composed builtins delegate to resolved operations

Files: [`packages/core/src/operation/builtins.ts`](../../packages/core/src/operation/builtins.ts),
[`packages/core/src/api/resource-client.ts`](../../packages/core/src/api/resource-client.ts)

- Restructure construction order so `exists`/`findFirst`/`getMany` are built after `getById`/
  `getAll` are resolved for that resource, and receive them as arguments.
- Add the `toArray` envelope helper; cover with a test using a resource whose `list` override
  returns `{ data, total }`.

### 3. Single retry decision

File: [`packages/core/src/request/execute.ts`](../../packages/core/src/request/execute.ts)

- Collapse the two `decideRetry` calls into one; add a test asserting `shouldRetry` is invoked
  exactly once per failed attempt.

### 4. Resource shape validation

File: [`packages/core/src/api/define-api.ts`](../../packages/core/src/api/define-api.ts)

- Throw a clear error naming the key when `path` is missing/non-string; test both overloads.

### 5. Stale comment fix

File: [`packages/core/src/operation/conventions.ts`](../../packages/core/src/operation/conventions.ts)

- Correct the header comment to describe always-on behavior.

### 6. Mock bridge cloning + operations support

Files: [`packages/mocking/src/store.ts`](../../packages/mocking/src/store.ts),
[`packages/mocking/src/bridge.ts`](../../packages/mocking/src/bridge.ts),
[`packages/mocking/src/resource.ts`](../../packages/mocking/src/resource.ts)

- Clone on every read in `store.ts`; add a mutation-safety regression test.
- Route `mock: "<id>"` resources' `operations` through the same resolution `resource.ts` already
  implements, rather than duplicating override logic in the bridge.

### 7. Index-backed mock lookups

File: [`packages/mocking/src/resource.ts`](../../packages/mocking/src/resource.ts)

- Add the id→index map at seed time; swap linear scans in `getById`/`exists`/`update`/`patch`/
  `delete` for map lookups; keep `search`/`findFirst`/`getBy`/`count` as scans (they're
  field-arbitrary, not id-keyed) — no behavior change, covered by existing tests.

### 8. `pagination` convention

Files: [`packages/core/src/operation/conventions.ts`](../../packages/core/src/operation/conventions.ts),
[`packages/core/src/types/definition.ts`](../../packages/core/src/types/definition.ts),
[`packages/core/src/types/inference.ts`](../../packages/core/src/types/inference.ts)

- Add the `pagination` field, its two envelope shapes, and type-level wiring for `getAll`'s
  query/response types when declared. Default `false` → no change to existing behavior/tests.

### 9. `readOnly` shorthand

File: [`packages/core/src/operation/expand.ts`](../../packages/core/src/operation/expand.ts) (or
wherever `operations` defaults are first assembled)

- Seed the write-op removal set from `readOnly`, before `operations` overrides are applied.

### 10. TanStack Query full coverage

Files: [`packages/tanstack-query/src/types.ts`](../../packages/tanstack-query/src/types.ts),
[`packages/tanstack-query/src/use-resource-query.ts`](../../packages/tanstack-query/src/use-resource-query.ts)

- Extend `ResourceLike`/`Infer*` to `AllBuiltinOpName`; add generated query/mutation entries for the
  11 new builtins; cover with tests mirroring the existing 5-builtin test pattern.

### 11. Tests, example, docs

- One regression test per fix (parse failure, mutation leak, composed-builtin override, double
  retry, missing-path validation).
- One test per improvement (`pagination`, `readOnly`, each new TanStack entry, index-backed lookup
  — the last via a behavioral test, not a timing test, since this repo doesn't assert on
  performance in CI).
- Update `docs/conventions.md`, `docs/context.md`, `CHANGELOG.md`, `docs/story.md`.

## Explicit non-steps

- Do not add schema validation, operation versioning/deprecation metadata, request dedup in Core,
  OpenAPI, or new packages.
- Do not rewrite shipped `versions/v0.1–v0.10` folders; `docs/context.md`'s milestone banner moves
  forward, that's all.
- Do not change the dataset catalog's maintenance model (codegen) — out of scope per `scope.md`.

## Suggested file touch list

| Path                                                                      | Action                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/core/src/transport/read-body.ts`                                | Throw `ParseError` instead of swallowing                    |
| `packages/core/src/transport/fetch.ts`                                    | Let parse failure propagate                                 |
| `packages/core/src/operation/builtins.ts`                                 | Composed builtins delegate to resolved ops; envelope helper |
| `packages/core/src/api/resource-client.ts`                                | Construction order: resolve getById/getAll first            |
| `packages/core/src/request/execute.ts`                                    | Single `decideRetry` call per attempt                       |
| `packages/core/src/api/define-api.ts`                                     | Validate resource `path` at call time                       |
| `packages/core/src/operation/conventions.ts`                              | Fix stale comment; add `pagination` convention entries      |
| `packages/core/src/types/definition.ts`                                   | `pagination`, `readOnly` fields                             |
| `packages/core/src/types/inference.ts`                                    | Type wiring for `pagination`                                |
| `packages/core/src/operation/expand.ts`                                   | `readOnly` shorthand resolution                             |
| `packages/mocking/src/store.ts`                                           | Clone on read                                               |
| `packages/mocking/src/bridge.ts`                                          | Route `operations` through shared resolution                |
| `packages/mocking/src/resource.ts`                                        | Id→index map; shared operations-resolution entry point      |
| `packages/tanstack-query/src/types.ts`                                    | `ResourceLike`/`Infer*` → all 16 builtins                   |
| `packages/tanstack-query/src/use-resource-query.ts`                       | Generated query/mutation entries for the 11 new ops         |
| `tests/core/*`, `tests/mocking/*`, tanstack-query tests                   | One regression test per fix, one per improvement            |
| `docs/context.md`, `docs/conventions.md`, `CHANGELOG.md`, `docs/story.md` | Honesty pass + completion note                              |

## Done when

All items in [acceptance-criteria.md](./acceptance-criteria.md) pass.
