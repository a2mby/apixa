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
- Do **not** couple mocking to production request execution.
- Do **not** expose server-only secrets to browser code.
- Do **not** add abstractions only because they might be useful later.

## Operation customization

A resource's `operations` accepts, per key, `true`, `false`, a config object, or a function:

- **Config object** — the existing `{ method, path, headers, timeout, retry, hasBody }` shape.
- **Function** — `(ctx, ...args) => Promise<T>`. `ctx.request(init)` runs the call through Core's
  normal pipeline (headers inheritance, retry, middleware, error classification) instead of
  reimplementing it. Called exactly like a generated operation: `api.resource.<name>(...)`.
- **`false`** — removes a builtin from the generated client. Removing a name that was never
  active is a no-op.
- **`true`** — enables a builtin with its default method and path. A custom name needs a config
  with `method` or a function; `true` alone cannot create an implementation.

A custom definition (object or function) with a builtin's name always overrides the convention.
`operations` suggests the 16 known names below for autocomplete while still accepting arbitrary
custom keys.

Every builtin below — the original 5 and the 11 added in v0.10.0 — is **always-on** for any
resource with a `path`, the same default-first behavior as the original 5 since v0.2.0. `false`
removes one; removing a name that was never a builtin at all is a no-op. Calling a route-based one
against a backend that hasn't implemented it 404s, the same as calling any unconfigured endpoint —
Apixa doesn't pretend the route exists, it just doesn't require you to opt in by name first.

| Name         | Method | Default path       | Basis                                                                        |
| ------------ | ------ | ------------------ | ---------------------------------------------------------------------------- |
| `getAll`     | GET    | _(resource path)_  | convention                                                                   |
| `getById`    | GET    | `/:id`             | convention                                                                   |
| `create`     | POST   | _(resource path)_  | convention                                                                   |
| `update`     | PUT    | `/:id`             | convention                                                                   |
| `delete`     | DELETE | `/:id`             | convention                                                                   |
| `getBySlug`  | GET    | `/slug/:slug`      | convention                                                                   |
| `patch`      | PATCH  | `/:id`             | convention — new method on an existing path                                  |
| `upsert`     | PUT    | `/:id`             | convention — alias of `update`'s path                                        |
| `count`      | GET    | `/count`           | convention                                                                   |
| `search`     | GET    | `/search`          | convention                                                                   |
| `createMany` | POST   | `/bulk`            | convention                                                                   |
| `deleteMany` | DELETE | `/bulk`            | convention                                                                   |
| `getMany`    | GET    | _(resource path)_  | own request with repeated `id` query values; accepts bare or paginated lists |
| `exists`     | GET    | `/:id`             | own request; maps 404 → `false`                                              |
| `findFirst`  | GET    | _(resource path)_  | own list request; returns first result or `null`                             |
| `getBy`      | GET    | _(given per call)_ | own request; `getBy(field, value)` or `getBy("/path/:x", value)`             |

`createMany` and `deleteMany` are the public names for the former bulk operations. Their default
wire path remains `/bulk`; `deleteMany` sends its ID array in the DELETE body. The original
`bulkCreate` and `bulkDelete` methods are no longer generated.

Each builtin uses its own resolved definition. Disabling or overriding `getAll` does not change
`getMany` or `findFirst`; changing `getById` does not change `exists`. For `getMany`, changing the
HTTP method retains the ID query mapping and does not invent a request body. The same applies to
`findFirst`'s query and `exists`'s path or `id` query. `hasBody: true` is unsupported on these
specialized operations because no body mapping is defined. `getBy` accepts a configured path as
a prefix, or a template containing `:field` and `:value`. Absolute operation paths may target
the configured API origin; cross-origin paths are rejected before the request is sent.
When a resource path has parameters, pass their named values after a specialized operation's
usual arguments: `exists(id, { orgId })`, `getMany(ids, { orgId })`,
`findFirst(query, { orgId })`, or `getBy(field, value, { orgId })`.

### Selection order

With only `path`, all 16 builtins are enabled. `defaultOperations: false` starts with none.
`readOnly: true` removes write operations; `writeOnly: true` removes read operations. The two flags
cannot both be true. These settings select client methods; they do not enforce server permissions.

`operationGroups` accepts `read`, `write`, `extended`, and `many`, each set to `true` or `false`.
`read` covers nine read operations and `write` seven write operations. `extended` covers the 11
operations beyond the original CRUD five. `many` covers `getMany`, `createMany`, and `deleteMany`.

Selection resolves in this order: builtin defaults, `defaultOperations`, read/write flags,
`extended`, `read` and `write`, `many`, then individual `operations` entries. `many` is more
specific than the broad groups and wins when they overlap, regardless of property order.
Individual entries always have the final say. This selection runs once when the client is built.
Literal `true` and `false` settings give exact method types. If a setting is a variable `boolean`,
the affected methods are optional in TypeScript because their runtime presence is conditional.

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    readOnly: true,
    operationGroups: { extended: false, many: true },
    operations: { create: true, createMany: { path: "/batch" }, deleteMany: false },
  },
});
// Exposes getAll, getById, getMany, create, and createMany.
```

`@apixa/mocking` mirrors the same always-on, add/remove/override surface on its own resources
(both `mock: "<dataset-id>"` and `defineMockApi`), implemented as in-memory data operations rather
than new HTTP routes. A Core mock resource gets the same `operations`-generated methods as a live
one — `mock` only swaps the transport. As of v0.11.0, the mock bridge also simulates `getBySlug`,
`count`, `search`, `createMany`, and `deleteMany` (`patch`/`upsert` already worked via `/:id`), and
accepts the same `operations` override (`false`, or `{ method?, path? }`) for those names. A
genuinely new custom **function** operation still 404s against the bridge — same honesty as an
unimplemented real backend route.

## Pagination and read-only resources (v0.11.0)

- `pagination?: "page" | "cursor"` on a resource — type-only, like `entity` / `list` / `query`.
  Absent by default: zero behavior or type change. `"page"` types `getAll` as
  `{ data, total, page, pageSize }` with a `page`/`pageSize` query; `"cursor"` types it as
  `{ data, nextCursor }` with a `cursor`/`pageSize` query. Apixa does not parse or invent this
  envelope — it only shapes types.
- `readOnly?: boolean` removes write defaults before groups and individual overrides are applied.

## Types

- Infer types from definitions where possible.
- Do not duplicate types unnecessarily.
- Keep the public export surface small and honest.

## Documentation honesty

- Mark features as **implemented** vs **planned**.
- Living docs live under [`docs/`](./):
  - [context.md](./context.md) — project direction
  - [architecture.md](./architecture.md) — structure and request flow
  - [roadmap.md](./roadmap.md) — phases
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

## Cursor agent workflow

Use these so the structure does not drift:

| Command              | When                                       |
| -------------------- | ------------------------------------------ |
| `/plan-change`       | Open issue + `task/N-slug` branch          |
| `/implement-version` | Code against the active `versions/vX.Y.Z/` |
| `/start-version`     | Create the next filled version folder      |
| `/check-structure`   | Audit docs/versions/packages layout        |
| `/git-push`          | Commit, PR, squash merge, story log        |

Rules live in `.cursor/rules/apixa-*.mdc`. Skill: `.cursor/skills/apixa-workflow/`.

How-to checklists for agents (and prose for humans): [`docs/guides/`](./guides/).

## Examples and tests

- `examples/basic` should demonstrate **implemented** API, not aspirational syntax.
- Tests for Core live under root `tests/` (see [tests/README.md](../tests/README.md)).
- Prefer testing behavior (URL building, success/error paths, generation) over testing implementation details.
