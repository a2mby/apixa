# `defineApi` audit

Date: 2026-11-13. Scope: everything a `defineApi` client does, from config to result: validation and
construction (`api/validate.ts`, `api/client.ts`, `api/resource-client.ts`, `operation/*`), the
request pipeline (`request/pipeline.ts`), wire encoding (`http/query.ts`, `http/body.ts`), response
reading (`transport/read-body.ts`), key transforms (`transform/keys.ts`), pagination and slice
(`api/pagination.ts`, `utils/slice.ts`) and the type layer (`types/definition.ts`,
`types/inference.ts`).

Evidence markers: **[run]** reproduced against the packaged build with a fake transport (or the real
Laravel backend); **[code]** read in the source, not executed; **[type]** reproduced with `tsc`.

## Summary

| #   | Problem                                                                                                                         | Severity                 | Evidence      |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------- |
| 1   | `slice` with `end` beyond the list returns **every** row, ignoring `start`                                                      | Bug                      | [run]         |
| 2   | `getMany` / `findFirst` silently return `[]` / `null` for any body that is not an array or `{ data: [] }`                       | Bug (silent data loss)   | [run]         |
| 3   | Request middleware that edits `request.query` changes mocked calls but is ignored by live calls                                 | Bug (live ≠ mock)        | [run]         |
| 4   | Envelope handling is hidden and inconsistent: `{ data }` is unwrapped for 2 operations only                                     | Design                   | [run]         |
| 5   | Results are cast, never checked: `count` can return an object, `json` can return a string                                       | Design                   | [run] [code]  |
| 6   | Response/request key transforms rewrite free-form user data (`attributes.max_speed` → `maxSpeed`)                               | Design (data corruption) | [run]         |
| 7   | Five call layouts; adding a path param changes every call site; query is a positional arg for one op and an option for the rest | DX                       | [run] [type]  |
| 8   | `kind` is mandatory on declarative custom operations although the method fully determines it                                    | DX                       | [code] [type] |
| 9   | Five overlapping operation-selection switches and three middleware syntaxes                                                     | DX                       | [code]        |
| 10  | Query values cannot express nested objects or dates; `null` and `[]` vanish; array format is client-wide                        | Gap                      | [run] [code]  |
| 11  | A string body is sent raw with no `Content-Type`                                                                                | Bug-ish                  | [run]         |
| 12  | Pagination maps `getAll` only; the string form is type-only on live resources; `defineMockApi` has a different pagination type  | Inconsistency            | [code] [type] |

## A. Configuration surface

**A1. `kind` is redundant for declarative operations.** [code] `validateMethodKind` requires
`kind === requiredKind(method)` exactly (`GET/HEAD/OPTIONS` → `read`, everything else → `write`), so
for `{ method, path }` operations `kind` carries no information. It is still mandatory at runtime
(`validate.ts`: "kind must be explicitly set") and in the types. The `OperationDefinition.kind`
field is typed optional while its doc says "Required", and that doc still names a package that no
longer exists (`@apixa/tanstack-query`). [type] Leaving it out _is_ reported, but as a
`ConfigTypeError` deep inside a long intersection type; in the Next consumer it then cascaded until
every operation of the resource reported "does not exist". `kind` is only meaningful for function
operations (`{ kind, run }`), which have no method.

**A2. Operation selection has five overlapping switches.** [code] `defaultOperations`, `readOnly`,
`writeOnly`, `operationGroups` (`read`/`write`/`many`/`extended`) and per-name `true`/`false` in
`operations`, resolved by a seven-step precedence chain (`operation/expand.ts`) that the type layer
must mirror exactly. Most configs need one of two things: "these builtins" or "all but these".

**A3. Four ways to write an operation.** [code] `true`/`false`, a config object, a bare function
(builtins only: a custom bare function is a `ConfigError`) and `{ kind, run }`. The bare-function
rule differs between builtin and custom names.

**A4. Three middleware syntaxes at three levels.** [code] `middleware: { onRequest, onResponse,
onError }`, `requestMiddleware: []` and `responseMiddleware: []`, at root, resource and operation.
`onError` exists only inside `middleware`, so the arrays cannot express it.

**A5. Settings that belong to a backend are root-only.** [code] `queryArrayFormat` and
`querySerializer` exist only on the root config. One client that talks to a PHP backend and a
Node backend cannot use `brackets` for one and `repeat` for the other.

**A6. Two sources of truth.** [code] `ApiState` (types) and the runtime config describe the same
resource. The state has `entity`, `list`, `query` and `operations`, but no way to declare the id
field for a live resource (`idKey` exists only under `mock`), so `getMany` and `exists` assume `id`.

**A7. `defineMockApi` diverges.** [code] Its `PaginationConfig` is `boolean | "page" | "cursor"`;
`defineApi` rejects `true` with a `ConfigError`. Both are exported from the root, which is why the
live type had to be named `ResourcePagination`.

**A8. Leftovers.** [code] The deprecated `RequestConfig` alias, a misplaced doc comment above
`OperationKind` (`types/definition.ts`), and the stale package name in A1.

## B. Operations and call signatures

**B1. Arguments are positional, and the layout changes with the path.** [run] For
`path: "/orgs/:orgId/users"`:

```ts
api.users.getAll("acme"); // one path param: a scalar
api.users.getById({ orgId: "acme", id: 7 }); // two path params: an object
api.users.exists(7, { orgId: "acme" }); // special builtins: own args first, params after
```

`parseOperationArgs` treats exactly one path param as a scalar and two or more as an object, so
adding a resource-level param silently changes the shape of every existing call. `exists`,
`getMany`, `findFirst` and `getBy` use a different order from the other builtins.

**B2. Query placement is inconsistent.** [type] `findFirst(query)` takes the filter as its first
argument; `getAll({ query })`, `search({ query })` and `count({ query })` take it inside the
options. Writing `search({ q })` or `count({ active: true })` is a type error.

**B3. Body and options compete for the same slot.** [code] For a body operation the second
positional argument is always the body, so passing only options requires `create(undefined, opts)`.

**B4. Overlapping builtins.** [code] `getBySlug(x)` is `getBy("slug", x)` with a different default
path. `update` and `upsert` both default to `PUT /:id`, so without a path override they send
identical requests. `search`, `getAll` and `findFirst` are three list reads with three signatures.

**B5. Loose builtin contracts.** [code] `getMany` always sends the query key `id`, whatever the
id field is. `getBy`'s default path is `/:field/:value`, which most backends would read as a nested
resource. `getBy`'s `field` is typed `string`, not a key of the entity, and its result is typed
`Entity`, not `Entity | null`.

## C. Request phase

**C1. Middleware query edits only work on mocks.** [run] The URL is built before request middleware
runs (`pipeline.ts`), and nothing rebuilds it afterwards. A middleware that adds `?name=Zed` filtered
the mocked result to `Zed` and left the live URL unchanged (`http://x/u?a=1`). `request.query` is
the wire query (after key transforms) while `request.body` is the public body (before them), so the
two halves of one request object are in different stages.

**C2. Query values are flat only.** [run] [code] The type allows strings, numbers, booleans and
arrays of those. Nested objects (`attr[color]=blue`, which the Laravel backend uses) and `Date`
cannot be expressed; forcing them produces `[object Object]` or a locale date string. `null`,
`undefined` and empty arrays are dropped, so "an empty list" cannot be sent. Booleans are sent as
`true`/`false`, which Laravel's `boolean` rule rejects unless the backend converts them.

**C3. Array formats.** [code] `repeat` (default) loses all but the last value on PHP; `brackets`
emits unencoded `[]`; `comma` is ambiguous for values that contain a comma.

**C4. String bodies.** [run] `create("hello")` sends the raw string with no `Content-Type`; a JSON
string value cannot be sent. Numbers and booleans are JSON-encoded, strings are not.

## D. Response phase

**D1. Envelopes are handled by accident.** [run] The body is returned as parsed, and the types
claim it is the entity: `getById` on `{ data: { id: 1 } }` resolves to `{ data: { id: 1 } }`.
`getMany` and `findFirst`, however, unwrap `{ data: [...] }` through a private `toArray` helper in
`resource-client.ts`, and for any other shape (`{ items: [...] }`) they resolve `[]` and `null`
with no error. This is why the Next consumer needs its own `unwrapEntity` middleware.

**D2. Results are cast, not checked.** [run] `count()` resolved `{ count: 5 }` while typed `number`.
`exists` is `status !== 404`. There is no runtime validation hook (it is on the roadmap).

**D3. `responseType: "json"` is not always JSON.** [code] A `text/*` response becomes a string; an
unknown content type tries `JSON.parse` and silently falls back to the raw text. Only a body that
claims to be JSON and fails to parse raises `ParseError`.

**D4. Key transforms touch user data.** [run] `transforms.response.keys: "camelCase"` rewrote
`attributes: { max_speed, "Some-Key" }` to `{ maxSpeed, someKey }`. The walk is recursive over every
plain object; free-form maps, JSON columns and dictionaries keyed by ids are all rewritten, and the
same is true for request bodies and queries.

**D5. The original envelope is gone.** [code] Response middleware and `{ full: true }` see the
shaped data (after pagination mapping and builtin shaping), and `raw` has already been read, so
fields the mapping drops (Laravel's `links`, `last_page`) cannot be recovered.

## E. Pagination and `slice`

**E1. `slice` bug.** [run] `slice: { start: 5, end: 20 }` on 10 rows returned rows 0–9: when `end`
exceeds the length, `applyResourceSlice` returns a copy of the whole array instead of
`slice(start)`.

**E2. `slice` is silently ignored on pages.** [run] With `pagination`, `getAll` returns an object and
`slice` passes it through untouched. On arrays it truncates after the full response was downloaded.

**E3. Pagination is `getAll`-only and has two semantics.** [code] `search`, `getMany`, `findFirst`
and custom list operations are not pagination-aware (the dashboard's `lowStock` returns the raw
Laravel envelope). The string form (`"page"`) only shapes types on live resources, while the object
form maps and validates; `preset` still requires `type` although the preset implies it.

**E4. Mock and live paging differ.** [code] Mocks read `page`/`pageSize`; live presets rename them
(`per_page`, `limit`, `pagination[page]`).

## F. Type layer

[type] Config mistakes become `ConfigTypeError` members inside long intersections; the message
exists but is hard to find, and a single mistake can make the whole client type unusable (A1).

## Recommendations

Ordered from safe fixes to a breaking redesign. Items marked **breaking** change existing calls or
config and belong in a new major version.

### Fixes (non-breaking)

1. Fix `slice` overshoot (E1) and throw `ConfigError` when `slice` is combined with `pagination` (E2).
2. Make `getMany` / `findFirst` throw `ParseError` for an unexpected body instead of `[]` / `null` (D1).
3. Rebuild the URL when request middleware changes `request.query`, so live matches mock (C1).
4. Derive `kind` from the method for declarative custom operations; keep it required only for
   `{ kind, run }` (A1). Fix the doc and the stale package name.
5. Let `preset` imply `type` (`pagination: { preset: "laravel" }`) and accept the shorthand
   `pagination: "laravel"` (E3).
6. Send a string body as `text/plain` unless a content type is set, and document it (C4).
7. Add per-resource `queryArrayFormat` / `querySerializer` (A5, C3).

### New, explicit features (non-breaking, opt-in)

8. `response: { unwrap: "data" }` (or a function) at root, resource and operation level, replacing
   the hidden `toArray` rule (D1). One rule, applied to every JSON result, visible in config.
9. Key-transform exclusions, for example `keys: { case: "camelCase", preserve: ["attributes"] }` (D4).
10. A `parse` / validation hook per resource or operation (`(body) => T`), so `count`, `exists` and
    entities can be checked instead of cast (D2, D3).
11. Pagination for every list-returning operation, including custom ones (`pagination: true` on
    the operation), and keep the original envelope available as `response.source` (E3, D5).
12. Nested query objects with `a[b]=c` encoding and ISO dates (C2).
13. Unify `defineMockApi`'s pagination type with `ResourcePagination` (A7).

### Redesign (**breaking**)

14. **One call shape for every operation:** identity first when the operation has one, then a
    single options object that holds everything else:

    ```ts
    api.users.getById(7, { params: { orgId: "acme" } });
    api.users.getAll({ params: { orgId: "acme" }, query: { active: true } });
    api.users.create({ name: "Ada" }, { params: { orgId: "acme" } });
    api.users.findFirst({ query: { email: "a@b.c" } });
    ```

    Path params always live in `params`; query always lives in `query` (B1, B2, B3).

15. **One selection switch:** `operations` accepts a preset (`"crud"`, `"read"`, `"all"`) or a list,
    plus per-name overrides; drop `defaultOperations`, `readOnly`, `writeOnly` and
    `operationGroups` (A2).
16. **One middleware syntax:** `middleware: [{ onRequest?, onResponse?, onError? }]` at every level
    (A4).
17. **Fewer, stricter builtins:** fold `getBySlug` into `getBy` with a typed field
    (`keyof Entity`) and `Entity | null`; give `upsert` a distinct default (for example
    `PUT /:id` with create semantics documented, or require an explicit path); make `getMany` use
    the declared id field (B4, B5, A6).
18. Remove the deprecated `RequestConfig` alias and other leftovers (A8).

### Suggested sequence

- **Now (v1.9.0, patch-level):** fixes 1–7.
- **Next minor:** features 8–13; they are opt-in and keep existing configs working.
- **Next major:** redesign 14–18, with a codemod or a migration guide, since every call site
  changes with 14.
