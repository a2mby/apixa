# Conventions

Shared rules for building Apixa Core, writing docs, and shipping version milestones.

## Tooling

- Package manager: **pnpm** (workspace at repo root).
- Language: **TypeScript**, strict mode.
- Node: `>=18`.
- Build Core with the existing package scripts (`build`, `typecheck`); do not introduce a second toolchain without a decision.

## Core API design

- Prefer **native `Promise<T>`** over custom Promise wrappers.
- Prefer **clear operation names** (`update`) over ambiguous ones (`appendUser`).
- **Custom endpoints win** over generated conventions.
- Do **not** silently claim backend support. Generated operations are configurable; a server must implement the selected wire conventions.
- Do **not** add React, Next.js, or TanStack Query as Core dependencies.
- Do **not** build caching or state management into Core.
- Mocking is client-scoped: a resource's `mock` decides at construction that its operations run against an in-memory store — never a global switch, never a live fallback (ADR 003).
- Do **not** expose server-only secrets to browser code.
- Do **not** add abstractions only because they might be useful later.

## Operation customization

A resource's `operations` accepts, per key, `true`, `false`, a config object, or a
`{ kind, run }` function definition:

- **Config object** — `{ method, path, headers, timeout, retry, hasBody, middleware, transforms, response, pagination, ... }`.
- **Custom function** — `{ kind: "read" | "write", run: (ctx, ...args) => Promise<T> }`.
  `ctx.request(init)` runs the call through Core's
  normal pipeline (headers inheritance, retry, middleware, error classification) instead of
  reimplementing it. Called exactly like a generated operation: `api.resource.<name>(...)`.
- **`false`** — removes a builtin from the generated client. Removing a name that was never
  active is a no-op.
- **`true`** — enables a builtin with its default method and path. A custom name needs a config
  with `method` or `{ kind, run }`; `true` alone cannot create an implementation.

- **Built-in function override** — may remain a bare function; its kind is inherited from the
  built-in convention.

**Read/write classification.** Declarative HTTP operations derive their classification from the
method (`GET`, `HEAD`, and `OPTIONS` -> `"read"`; `POST`, `PUT`, `PATCH`, and `DELETE` -> `"write"`),
including method overrides on builtins; explicit `kind` on declarative operations is optional when
consistent with the method and rejected if mismatched. Function operations still require `{ kind, run }`.
The same validation applies to every function-operation `ctx.request()` before dispatch. Every resource
client carries the result as non-enumerable, frozen metadata under `OPERATION_METADATA`
(`getOperationMetadata(resource)`):
`{ kind, builtin, implementation: "request" | "function", optionsIndex }`, where `optionsIndex` is
the position of the trailing `RequestOptions` argument (`null` for function operations, whose
signature Core does not own). It is typed per operation (`OperationKindsOf<typeof api.users>`) and
integrations use it instead of guessing from names or HTTP verbs.

A custom definition (object or function) with a builtin's name always overrides the convention.
`operations` suggests the 13 known names below for autocomplete while still accepting arbitrary
custom keys.

Every builtin below is **always-on** for any resource with a `path`. `false` removes one; removing
a name that was never a builtin at all is a no-op. Calling a route-based one against a backend
that hasn't implemented it 404s, the same as calling any unconfigured endpoint — Apixa doesn't
pretend the route exists, it just doesn't require you to opt in by name first. (`getBySlug`, `upsert`,
and `search` were removed in v3; define custom operations when a backend exposes them.)

| Name         | Method | Default path       | Basis                                                                 |
| ------------ | ------ | ------------------ | --------------------------------------------------------------------- |
| `getAll`     | GET    | _(resource path)_  | convention                                                            |
| `getById`    | GET    | `/:id`             | convention                                                            |
| `create`     | POST   | _(resource path)_  | convention                                                            |
| `update`     | PUT    | `/:id`             | convention — `(id, { body, ...options })`                             |
| `delete`     | DELETE | `/:id`             | convention                                                            |
| `patch`      | PATCH  | `/:id`             | convention — `(id, { body, ...options })`                             |
| `count`      | GET    | `/count`           | convention                                                            |
| `createMany` | POST   | `/bulk`            | convention                                                            |
| `deleteMany` | DELETE | `/bulk`            | convention                                                            |
| `getMany`    | GET    | _(resource path)_  | own request with repeated identity-key query values; expects an array |
| `exists`     | GET    | `/:id`             | own request; maps 404 → `false`                                       |
| `findFirst`  | GET    | _(resource path)_  | own list request; returns first result or `null`                      |
| `getBy`      | GET    | _(given per call)_ | own request; `getBy(field, value)` or `getBy("/path/:x", value)`      |

`createMany` and `deleteMany` are the public names for the former bulk operations. Their default
wire path remains `/bulk`; `deleteMany` sends its ID array in the DELETE body.

Each builtin uses its own resolved definition. Disabling or overriding `getAll` does not change
`getMany` or `findFirst`; changing `getById` does not change `exists`. For `getMany`, changing the
HTTP method retains the ID query mapping and does not invent a request body. The same applies to
`findFirst`'s query and `exists`'s path or `id` query. `hasBody: true` is unsupported on these
specialized operations because no body mapping is defined. `getBy` accepts a configured path as
a prefix, or a template containing `:field` and `:value`. Absolute operation paths may target
the configured API origin; cross-origin paths are rejected before the request is sent.
When a resource path has parameters, pass their named values in `options.params`:
`exists(id, { params: { orgId } })`, `getMany(ids, { params: { orgId } })`,
`findFirst({ params: { orgId }, query })`, or `getBy(field, value, { params: { orgId } })`.
Detail writes take `(id, { body, params?, ... })`: `update(id, { body })` and `patch(id, { body })`.
Declarative custom reads take `({ params?, query?, ... })`; declarative custom writes default to
`hasBody: true` (`(body, options?)`) unless `hasBody: false` is set.

### Selection

With only `path`, all 13 builtins are enabled. `operations` selects a `"crud"`, `"read"`, or
`"all"` preset, or an explicit array of builtin names. A bag can set `preset` to either form and
add named overrides; those overrides take precedence regardless of property order. `preset` is
reserved for selection. These settings select client methods; they do not enforce server permissions.
Literal selections produce exact method types, while dynamic selections may make methods optional.

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  resources: {
    users: {
      path: "/users",
      operations: {
        preset: ["getAll", "getById", "getMany"],
        create: true,
        createMany: { path: "/batch" },
      },
    },
  },
});
// Exposes getAll, getById, getMany, create, and createMany.
```

## Configuration shape

- Resources live only under `resources`. Root-level resource objects are rejected with a
  migration hint, and unknown keys at any level are rejected both in TypeScript and at
  construction (`ConfigError`).
- `headers`, `timeout`, `retry`, `middleware`, `response`, and
  `transforms` are accepted at the root, resource, and operation levels. The most specific
  value wins (`false` disables an inherited `retry` or `response` hook). Headers also accept a
  per-call value and may be static, a sync provider, or an async provider (evaluated on every logical call).
- `queryArrayFormat` (`"repeat"` | `"comma"` | `"brackets"`) and `query`
  (`{ nulls?: "omit" | "empty" | "null", emptyArrays?: "omit" | "empty", booleans?: "string" | "number" }`)
  configure query string serialization client-wide on `defineApi`. Nested plain objects serialize with
  bracket notation; circular, non-finite numbers, symbols, functions, or depth > 64 throw `SerializationError`.
- `retry: 2` is shorthand for `{ retries: 2 }`. By default only `GET`, `HEAD`, and `OPTIONS` are
  retried. Writes need an explicit `methods` entry. A `Retry-After` longer than `maxDelayMs`
  stops retrying. `timeout` is one budget for the whole call, including backoff.
- `transforms: { request: KeyTransformConfig, response: KeyTransformConfig }` supports `camelCase`,
  `snake_case`, `PascalCase`, and `kebab-case`, with optional `exclude`, `preserve`, and `maxDepth`
  (default `64`). Conversion is recursive over plain objects and arrays, leaves values and special
  objects untouched, and never mutates its input. Colliding keys, cycles, or depth overflow throw
  `TransformError`. TypeScript exposes the converted keys at every level (root, resource, operation).
- `response: { unwrap?, parse?, validate? }` extracts envelopes (dot-path or callback), parses, and
  validates decoded payloads; `ApiResponse.source` keeps the raw parsed body prior to response stages.
- Error middleware receives `(error, { request, replay })`. `replay()` re-runs the call once (fresh headers),
  e.g. refresh a token on 401 and `return replay()`; it is `undefined` inside a replay.
- Register middleware as an array of `{ onRequest?, onResponse?, onError? }` objects under `middleware`.
  Hooks run from client to resource to operation, in array order within each level.
- Request middleware sees `request.query` already transformed by `transforms.request`. Mutations to
  `request.query` or `request.url` stay synchronized across transport, mocks, URLs, and response/error
  `request` metadata.
- `getMany` and `findFirst` expect an array response; unpaginated `getAll` expects an array (or configured
  paginated object when `pagination` is active). Invalid shapes raise `ResponseShapeError`, whose
  `data` and `response` retain the parsed source and response details; an empty array is valid.
- An operation whose body type is unknown (e.g. a custom POST) may be called without a body.
- Clients are frozen. To use a different base URL, build another client, or use `defineApis()`.

## Mocking (client-scoped, data-first)

`mock` is a data source only. Operation behavior always lives in `operations`.

| Form                          | Types from                | Loading                             |
| ----------------------------- | ------------------------- | ----------------------------------- |
| `mock: "users-mock"`          | `MockDatasetCatalog`      | that dataset only, first use        |
| `mock: [{ id: 1, … }]`        | widened element type      | validated at construction           |
| `mock: () => import(…)`       | resolved element type     | first use, once, retried on failure |
| `mock: { data, idKey, seed }` | as above; `idKey` checked | `seed: { limit, offset }`           |

- All 13 builtins run directly against the store; none calls another.
  - `getMany` returns results in request order and omits missing IDs.
  - `findFirst` and `count` match flat fields by string equality.
  - `createMany` is atomic; `deleteMany` ignores missing IDs.
- Overridden builtin paths keep their builtin semantics.
- `ctx.request()` and declarative custom operations with no `mock` handler are routed by method and
  path relative to the resource. Anything else throws `MockError` with code `MOCK_UNSUPPORTED`. No
  request is ever sent.
- Each client has its own stores. `resetMock(api.users)` or `resetMock(api)` restores the
  seeded state.
- `pagination` is one contract for live and mocked resources: `{ data, total, page, pageSize }`
  or `{ data, nextCursor }`. It can be configured at the resource level or per list operation
  (`getAll`, `getMany`, declarative custom reads); operation-level `pagination: false` opts out of
  resource pagination. The mock engine produces the page envelope. For a live resource the string form
  (`"page"` / `"cursor"`) declares that the server already returns it (types only, body
  untouched). To map a backend's own shape, use an object: `{ type, preset }` (`laravel`, `laravel-paginator`, `strapi`, `payload`, `nestjs`),
  `{ type, fields, params }` (dot paths for response fields; `params` renames the `page` /
  `pageSize` / `cursor` query keys), or `{ type, parseList(body, { status }) }` which wins over
  both. Fields are declared, never guessed; a missing or wrong-typed mapped field throws
  `ParseError`. The mapping runs on live calls before response key transforms (which
  then apply to the rows).
  Import the types from `apixa`: `Page<T>`, `CursorPage<T>`, `PageResult<T>`, `ResolvedPagination`,
  `PaginationMode`, `PaginationQueryOf`, `ResourcePagination`, `PaginationPreset`, `PaginationFields`,
  and `PaginationParams`.
  Per-preset state types name what `getAll` resolves to: `LaravelPagination<T>`,
  `LaravelPaginatorPagination<T>`, `LaravelCursorPagination<T>`, `StrapiPagination<T>`,
  `PayloadPagination<T>` and `NestjsPagination<T>` (all structurally `Page<T>` / `CursorPage<T>`).
- `slice` applies native `Array.prototype.slice` semantics after a full list has been fetched; it
  does not limit backend work or network transfer. Combining `slice` with `pagination` is a `ConfigError`.

## Types

- Infer types from definitions where possible.
- Do not duplicate types unnecessarily.
- Keep the public export surface small and honest.

## Documentation honesty

- Mark features as **implemented** vs **planned**.
- Living docs live under [`docs/`](./):
  - [context.md](./context.md) — project direction
  - [architecture.md](./architecture.md) — structure and request flow
  - [public-api.md](./public-api.md) — public entry-point contract
  - [roadmap.md](./roadmap.md) — milestone status and phases
  - [use-cases.md](./use-cases.md) — manual-testing catalog
  - [decisions/](./decisions/) — ADRs
  - [guides/](./guides/) — short how-tos ([humans](./guides/humans/), [agents](./guides/agents/))
- Milestone specs live under [`versions/`](../versions/). A version folder freezes intent for that release. Do not invent empty future version folders; add them when that milestone starts.

## Version folders

Each active or completed milestone under `versions/vX.Y.Z/` should include:

| File                     | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `context.md`             | Frozen subset of project context for that release        |
| `scope.md`               | In / out for the milestone                               |
| `implementation-plan.md` | Ordered smallest-path plan                               |
| `acceptance-criteria.md` | Checklist that must pass before calling the version done |

See [versions/README.md](../versions/README.md).

## Coding against a version

1. Read `docs/context.md` for principles.
2. Read `versions/<current>/` for the coding contract.
3. Preserve working setup; reshape existing Core files before adding packages.
4. Update `docs/story.md` when a meaningful milestone lands.
5. Update living docs when direction changes; do not rewrite frozen version folders after the version ships unless correcting factual errors.

## AI agent workflow

Use these so the structure does not drift:

| Command              | When                                                      |
| -------------------- | --------------------------------------------------------- |
| `/plan-change`       | Open issue + `task/N-slug` branch                         |
| `/implement-version` | Code against the active `versions/vX.Y.Z/`                |
| `/start-version`     | Create the next filled version folder                     |
| `/check-structure`   | Audit docs/versions/packages layout                       |
| `/publish-library`   | Publish root `apixa` to npm `latest` (owner request only) |
| `/git-push`          | Commit, PR, squash merge, story log                       |

- Reusable workflows live in `.agents/skills/`; rules live in `.ai/rules/`. Run `pnpm ai:sync` after changing canonical configuration and `pnpm ai:check` to verify it. The command names above use slash syntax; Codex uses `$plan-change`, `$git-push`, etc. See [the AI configuration guide](../.ai/README.md) for provider discovery, roles and native settings ownership.
- Release work has its own skill: `.agents/skills/publish-library/` (owner request only).

How-to checklists for agents (and prose for humans): [`docs/guides/`](./guides/).

## Examples and tests

- `examples/frontends/basic` should demonstrate **implemented** API, not aspirational syntax.
- Tests for Core live under root `tests/` (see [tests/README.md](../tests/README.md)).
- Prefer testing behavior (URL building, success/error paths, generation) over testing implementation details.
