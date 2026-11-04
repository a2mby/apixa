# Story

Project log. Newest entry first.

## 2026-11-04 — Complete the defineApi architecture: resources, defineApis, client-scoped mocking (#58)

Implemented Parts C–F of the defineApi architecture specification on top of #57.

- **Configuration:** Resources now live under `resources`. `defineApis()` reuses the same
  engine. Configuration is validated when the client is built, unknown keys are rejected at
  compile time and at runtime, and clients are frozen.
- **Mocking:** Removed global mock processors and the pathname-matched mock transport. Mocking
  is now a data-first, client-scoped execution branch backed by one `MockStore` that
  `defineMockApi` also uses. It supports dataset IDs, inline records, providers, and
  `{ data, idKey, seed }`. All 15 advertised datasets now resolve, each loaded lazily on its
  own. A mocked resource never falls back to the network.
- **HTTP lifecycle:** Added header providers, origin checks after middleware, a single
  timeout/retry/abort lifecycle, and hook-style middleware in three styles sharing one
  pipeline.
- **Transforms:** Added typed recursive key transforms (root, resource, and operation level) that throw on collisions.
- **Middleware:** Error middleware gets `replay()` for token-refresh flows, and operations with an unknown body type accept an omitted body.
- **Tests:** The suite grew from 247 to 443 tests.

## 2026-11-04 — Land defineApi operation and type refactor (#56)

Aligned `defineApi`'s generated methods with literal runtime resource configuration while keeping
the explicit metadata and inferred call forms. Consolidated builtin defaults and group membership,
renamed the public bulk methods to `createMany` / `deleteMany`, and made the four specialized
builtins execute independent requests. Added default/group/individual selection, cross-origin
operation-path protection, mock ID filtering, and TanStack support for partially disabled resources.

## 2026-11-04 — Land v0.11.0 harden leftovers (#54)

Closed the stacked post-v0.10 hardening that had to wait for a separate issue: `ParseError` on
malformed declared-JSON bodies, a single `decideRetry` per failed attempt, and
`useResourceMutation` for builtins/custom ops outside `useResourceQuery`. Froze
`versions/v0.11.0/` and added `docs/study-guide.md`. Several acceptance items (mock store clone,
extended mock routes, `readOnly` / pagination typing, path validation, composed-builtin delegation)
had already shipped inside the v0.10.0 land via shared files — this issue documents that and lands
the remaining dedicated pieces.

## 2026-11-04 — Land v0.10.0 fully customizable resource operations (#52)

Shipped `operations` as config object, function, or `false` per key on both `defineApi` and
`@apixa/mocking`, with 11 always-on builtins (`getBySlug`, `patch`, `upsert`, `count`, `search`,
`bulkCreate`, `bulkDelete`, `getMany`, `exists`, `findFirst`, `getBy`) next to the original CRUD
five. Custom ops call as `api.resource.<name>()`; suggested-keys typing covers all 16 names.
Acceptance criteria for `versions/v0.10.0/` checked. Follow-up hardening (parse failures, mock
bridge gaps, TanStack coverage) stays for a separate v0.11.0 issue — some shared-file prep already
rode along in this tree and will be scoped there.

## 2026-11-02 — Revise v0.10.0 builtins to always-on; add `getBy` (#52)

Direction change, by direct user request: the 11 builtins added in v0.10.0 (10 originally scoped

- a new `getBy` general lookup) flip from opt-in-only to **always-on** for any resource with a
  `path` — the same default-first treatment the original 5 have had since v0.2.0. No `operations`
  entry is needed to call `api.users.count()`, `api.users.exists(id)`, etc.; `false` still removes
  one by name. Added `getBy(fieldOrPath, value)`: a `:placeholder` in the first argument
  interpolates, otherwise the value is appended as a path segment — a general escape hatch for a
  one-off custom field/key lookup without a preset convention. Mirrored on `@apixa/mocking`
  (`getBy` finds by any given field name against the in-memory store). Simplified Core's
  `inference.ts` (the old "referenced opt-in" branch collapses into the same always-on branch as the
  original 5). Updated `tests/core/default-operations.test.ts`, `tests/core/define-api.test.ts`,
  `tests/mocking/mock-api.test.ts` (now expect all 16 names), `examples/next/lib/api.ts`
  (simplified — builtins no longer need declaring), and all v0.10.0 planning docs + `docs/conventions.md`
  / `docs/context.md` / `docs/architecture.md` / `CHANGELOG.md` to match. `pnpm typecheck` and
  `pnpm test` (188 tests, 27 files) pass. Still uncommitted on `task/52-customizable-resource-operations`.

## 2026-11-02 — Implement v0.10.0 Fully customizable resource operations (#52)

Shipped `operations` accepting a config object, a function, or `false` per key on both
`defineApi` and `@apixa/mocking` resources. `false` removes a builtin (no-op if inactive); a
function runs through a bound `ctx.request()` / `ctx.rows()` + `ctx.defaults` helper instead of
reimplementing the pipeline, and is called exactly like a generated operation. `operations` now
suggests the 15 known names via `OperationsBag<V>` while still accepting arbitrary custom keys.
Added 10 opt-in builtins (`getBySlug`, `patch`, `upsert`, `count`, `search`, `bulkCreate`,
`bulkDelete`, `getMany`, `exists`, `findFirst`) — never auto-expanded; `exists` / `findFirst` /
`getMany` are composed over `getById` / `getAll`, not new backend routes. Mirrored the same
surface on `@apixa/mocking` (`mock: "<dataset-id>"` and `defineMockApi`); documented that the
generic mock REST store only simulates the wire shapes it already understood (plus `patch` /
`upsert` for free), the same honesty as an unimplemented real backend route. 33 new tests across
Core and mocking; `pnpm typecheck` and `pnpm test` (184 tests) pass. Implementation only — not yet
merged to `main`.

## 2026-11-02 — Start v0.10.0 Fully customizable resource operations

Opened [`versions/v0.10.0/`](../versions/v0.10.0/) to let `operations` accept a config object, a
function, or `false` per key — on both `defineApi` and `@apixa/mocking` resources — with custom and
built-in operations surfacing identically as `api.resource.<name>()`. Locks 10 new opt-in builtins
(`getBySlug`, `patch`, `upsert`, `count`, `search`, `bulkCreate`, `bulkDelete`, `getMany`, `exists`,
`findFirst`) and suggested-keys typing for `operations` autocomplete. Contract and pointers only — no
implementation in this kickoff.

## 2026-11-01 — Land v0.9.0 Flatten Core mock syntax

Shipped `mock: "<dataset-id>"` on `defineApi` resources (removed `mock: true` / `mockConfig`). Resource-level `pagination` sits next to `path` / `slice` / `mock`. Core `MockDatasetIds` lists known catalog ids for autocomplete without importing `@apixa/mocking`. `defineMockApi` accepts string shorthand. Next playground + docs/tests updated.

## 2026-11-01 — Start v0.9.0 Flatten Core mock syntax

Opened [`versions/v0.9.0/`](../versions/v0.9.0/) to collapse `mock: true` + `mockConfig` into `mock: "<dataset-id>"`, put `pagination` beside `path` / `slice` / `mock`, fill Core `MockDatasetIds` for autocomplete without importing `@apixa/mocking`, and add `defineMockApi` string shorthand. Contract and pointers only — no package implementation in this kickoff.

## 2026-10-30 — Land v0.8.0 Unified TanStack Query resource integration

Shipped `@apixa/tanstack-query` with primary `useResourceQuery` (list state + Promise CRUD/`getById` + invalidate + `mutations.*`). Internals: key factory, controller `queryOptions`/`mutationOptions`, invalidate-first cache with D1 callback order. Escape hatch `@apixa/tanstack-query/advanced`. Next playground migrated; tests under `tests/tanstack-query/`. Core remains React-free. Deferred: `patch-list`, optimistic helpers, infinite queries, auto custom ops.

## 2026-10-30 — Start v0.8.0 Unified TanStack Query resource integration

Opened [`versions/v0.8.0/`](../versions/v0.8.0/) for optional `@apixa/tanstack-query` with non-negotiable unified `useResourceQuery` DX. Locked D1–D5 in the implementation plan: callback composition order, mutation concurrency/pending semantics, inference from Apixa signatures, query-key identity (scope + list params), and invalidate-first v1 cache (defer `patch-list` / optimistic / infinite). Contract and pointers only — no package implementation in this kickoff.

## 2026-10-30 — Align mockApi getAll typing with defineApi lists (#45)

`defineMockApi` `getAll` is now strictly `T[]` or `Page<T>` (no `Page | T[]` fallback). Next `api` / `mockApi` users both return `User[]`; paginated `Page` stays on comments. Playground query uses `data ?? []` typed as `User[]` so TanStack defaults are not `never[]`.

## 2026-10-30 — Align Core builtin name with mocking: `getById` (#43)

Renamed `defineApi`’s builtin `getByID` → `getById` (conventions, `BuiltinOpName`, `ResourceClient`, docs, tests) so it matches `defineMockApi`. Breaking; no alias. Shipped `versions/` folders left historical.

## 2026-10-30 — Mock `slice`, full users-mock, drop users-sample; land v0.7.0 (#41)

Renamed mock `size` → `slice` (`number` | `{ start, end }`) with `InvalidSliceError` under `MockingErrors`; Core `users-mock` now seeds all 100 rows; removed `users-sample` / `@apixa/mocking/data/users`. Also shipped v0.7.0 thin Core + plugin seams (path-param concat, `full` / re-callable middleware, extension interfaces, structured error codes).

## 2026-10-21 — Start v0.7.0 Thin Core + plugin seams

Opened [`versions/v0.7.0/`](../versions/v0.7.0/) to make Core thin and stable: types cleanup, body/query runtime, RequestOptions (`full` / `responseType` / `meta`), breaking middleware re-call model, retry hooks, extension seams (mock keys move to `@apixa/mocking` augmentation), and structured error codes. Auth/cache/validation/pagination helpers stay out. Contract and pointers only — no implementation in this kickoff.

## 2026-10-21 — Land v0.6.0 Core request reliability (#39)

Shipped abort/`AbortSignal` + timeout product surface (`AbortError` / `TimeoutError`), opt-in `retry` (safe `GET`/`HEAD` defaults, exponential backoff), and thin ordered `middleware` wrapping the retry loop. Selective mock transport honors `AbortSignal`; Next `lib/api.ts` demos the config. Core-only; schema hooks and live pagination conventions remain planned.

## 2026-10-21 — Start v0.6.0 Core request reliability

Opened [`versions/v0.6.0/`](../versions/v0.6.0/) for first-class abort/`AbortSignal`, documented timeouts, configurable retries, and thin middleware. Core-only; no client/server packages, schema library, TanStack package, or live pagination conventions. Contract and pointers only — no reliability implementation in this kickoff.

## 2026-10-21 — Ignore Next local scaffolding in git (#36)

Git keeps only the Next demo API surface (`README`, `app/page.tsx`, `lib/api.ts`, `lib/comments.ts`, `lib/mock-api.ts`). Local scaffolding (`package.json`, `tsconfig.json`, layout/components/query client, etc.) stays on disk for running the app but is gitignored.

## 2026-10-21 — Paginated mock pages through TanStack Query (#34)

Kept `defineMockApi` honesty: `pagination: true` → `Page<T>` (`data`, `total`, `page`, `pageSize`, plus `previous` / `next` page numbers). Next example wires `useQuery` to the page envelope and reads `.data` in the UI — no unwrap helper.

## 2026-10-18 — Human and agent how-to guides (#32)

Added `docs/guides/` with `humans/` and `agents/` folders: short task guides (extend `MockDatasetIds`, fix a small bug, plan-and-land via `/plan-change` + `/git-push`). Conventions and the docs Cursor rule point at the new tree so contributors and agents share the same how-to home.

## 2026-10-18 — MockDatasetIds autocomplete for mockConfig.type (#30)

Core exports an empty extensible `MockDatasetIds`; `@apixa/mocking` data modules merge preset ids next to `registerDatasetPreset`, so importing `@apixa/mocking/data` teaches `mockConfig.type` autocomplete while still accepting custom strings. Builtins cover the small synthetic presets; mocking README documents the customize-your-own pattern. `/git-push` now always runs `npm run format`, and Prettier-only diffs outside Touches are allowed.

## 2026-10-18 — Resource mocks without side-effect mocking import (#28)

Core treats `@apixa/mocking` as an optional peer: when `defineApi` sees unhandled `mock` / `mockConfig`, it strips those keys and deferred-loads `@apixa/mocking/register` on first request. No side-effect `import "@apixa/mocking"` is required; missing peer yields a clear error. Extends shipped v0.5.0 without a new versions folder.

## 2026-10-18 — Standalone `defineMockApi()` in `@apixa/mocking`

Added `defineMockApi({ users: { type, size, pagination } })`: a local, in-memory mock API with typed CRUD, pagination, and isolated state per call — no `defineApi()`, transport, or network. Datasets load lazily from the root `datasets/` JSON (one chunk each); `@apixa/mocking/data` exports typed records and entity types. Removed `createMockTransport` (and the unusable `createSelectiveMockTransport` export). Core and its resource-level `mock` / `mockConfig` processor are untouched. Three datasets (`states-csc`, `states-parseapi`, `counties-parseapi`) are not exposed: too large, and two have non-unique ids.

## 2026-10-18 — Resource-level mock / mockConfig on Core defineApi (#25)

Core gained a generic `registerDefineApiProcessor` extension point; `@apixa/mocking` registers a processor that honors resource `mock` / `mockConfig` (selective Transport, in-memory CRUD, size + pagination envelope) without a second `defineApi`. Typed presets ship as `@apixa/mocking/data/*`. Global `createMockTransport` kept for compatibility.

## 2026-10-18 — Land v0.5.0 Simple Mocking and dataset collection (#23)

Shipped `@apixa/mocking` (browser-safe transport + `@apixa/mocking/node` loaders), removed FastAPI `backend/` and backend scripts, and filled root `datasets/` with domain folders, `manifest.json` provenance, and `ATTRIBUTION.md`. Imported CC0/ODbL geography/reference sets; generated deterministic synthetics (Faker seed `230523`) where redistribution was unclear. Core production Fetch path unchanged; online catalog remains planned only.

## 2026-10-18 — Expand local mock dataset collection (#23)

Filled root `datasets/` with domain folders (`geography`, `reference`, `users`, `companies`, `products`, `orders`, `social`, `comments`), `manifest.json` provenance, and `ATTRIBUTION.md`. Imported CC0 parseapi lists + ODbL CSC/mledoze (cities capped to capitals). Skipped unclear/restricted sources (DummyJSON, country-codes combo, catalog sites); substituted deterministic Faker/PRNG synthetics (seed `230523`). Registry walks nested folders. Build script: `pnpm datasets:build`.

## 2026-10-18 — Land v0.5.0 Simple Mocking

Shipped `@apixa/mocking` (`loadDataset`, `listDatasets`, `createMockTransport`), root `datasets/users-sample`, Next + basic examples on mock transport, and removed FastAPI `backend/` plus backend run scripts. Core production Fetch path unchanged (no Core `mocks` API). Online catalog remains planned only.

## 2026-10-18 — Start v0.5.0 Simple Mocking

Opened [`versions/v0.5.0/`](../versions/v0.5.0/) for local JSON datasets, an `@apixa/mocking` registry + mock `Transport`, and removal of the FastAPI `backend/`. No website or hosted catalog in this milestone. Contract and pointers only — no mocking implementation in this kickoff.

## 2026-10-18 — Land v0.4.0 entity-only `defineApi<T>()` state typing

Replaced branded `type<T>()` markers with a resource-only Zustand-style state: `defineApi<AppApi>()({ … })` where `AppApi` declares `path` + `entity`. Core derives `create` / `update` (`Omit` / `Partial` on `"id"`), types root builtins separately, and adds `BuiltinHeaders`. `type` / `Type` / `Infer` are removed from `@apixa/core`.

## 2026-10-18 — Add Prettier root format command

Installed Prettier at the workspace root with `.prettierrc.json` and `.prettierignore`. `npm run format` (and `pnpm format`) now formats supported source and docs across the monorepo while skipping build outputs, lockfiles, and local examples.

## 2026-10-18 — Land v0.3.0 `type<T>()` markers

Implemented branded `type<T>()` / `Type<T>` / `Infer` in `@apixa/core`. Operation `body` / `response` accept markers only; inference unwraps them; `{} as T` no longer type-checks. Tests, Next example, README, and `CHANGELOG.md` updated. Follow-ups `crud<>()` and path-param inference remain planned.

## 2026-10-18 — Retarget GitHub owner to a2mby

Living docs, README, `/plan-change`, and `/git-push` now point at `a2mby/apixa` after the account rename from `a2mbyd`. Added [`docs/external-context.md`](./external-context.md) so external agents get the same owner and planning rules before a change brief.

## 2026-10-10 — Start v0.3.0 resource typing

Opened [`versions/v0.3.0/`](../versions/v0.3.0/) as the active coding contract: branded `type<T>()` markers for per-operation `body` / `response`, with `Infer` unwrap and a breaking move away from `{} as T`. Reliability work (abort, retries, middleware) moves to a later roadmap heading. No Core code in this kickoff — contract and pointers only.

## 2026-10-10 — Land v0.2.0 contract and living docs

Froze [`versions/v0.2.0/`](../versions/v0.2.0/) as the active coding contract and marked v0.1.0 completed. Living docs, README, and Cursor rules now describe default-first resource CRUD to match Core already on main. Acceptance criteria for v0.2.0 are checked off.

## 2026-10-10 — Resource client builtins complete in TypeScript

`ResourceClient` now declares required `getAll` / `getByID` / `create` / `update` / `delete` keys so IDEs complete `api.users.…` without `Awaited<ReturnType<…>>`. Empty or missing `operations` still yields the same surface at runtime via `expandOperations`. Next example (local) uses path-only `users` without `ReturnType` gymnastics.

## 2026-10-10 — Core folder-per-concern; untrack examples

Restructured `@apixa/core` internals into folders (`api/`, `operation/`, `request/`, `errors/`, `types/`, `http/`, `transport/`) with short single-purpose modules. Public exports unchanged; only `index.ts` remains at `src/` root. Ignored `examples/**` in git so playgrounds stay local for now.

## 2026-10-10 — Land v0.1.0 Core and frontend playgrounds

Merged `@apixa/core` `defineApi`, the Vitest suite (fake Transport), Next-first multi-framework examples, and macOS/Linux/Windows frontend run scripts onto main. `/plan-change` now requires a Tests section for functional changes so the suite keeps growing. v0.1.0 acceptance criteria are complete.

## 2026-10-09 — Frontend examples (Next-first)

Added framework playgrounds under `examples/` that consume `@apixa/core` against the FastAPI backend: **Next.js** (primary — RSC + client mutations), React+Vite, Vue, vanilla DOM, Angular, and React Native (Expo), plus the existing Node `basic` CLI. Platform scripts under `scripts/{macos,linux,win}/run-frontend-*.{sh,bat}` (shared helper in `scripts/lib/`). Root scripts: `pnpm example:next` (and `:react`, `:vue`, `:vanilla`, `:angular`, `:react-native`).

## 2026-10-09 — v0.1.0 Core: defineApi

Implemented `@apixa/core` against the v0.1.0 contract: `defineApi()` with opt-in resource operations, native `Promise<T>` (unwrapped data), Fetch as the default in-Core transport, and injectable `Transport` for tests. Custom operation definitions override convention defaults; unconfigured methods are not generated. Production `mocks` / auth / logging middleware are not part of the public API.

Example (`examples/basic`) and README show the implemented client. Root Vitest suite under `tests/core/` covers definition, overrides, URL building, success, and HTTP/network errors. `pnpm typecheck` and `pnpm test` pass.

## 2026-10-09 — SETUP THE REPO

Landed the full Apixa workspace on main: living docs, v0.1.0 coding contract, Core and basic example packages, FastAPI backend with platform run/stop/restart scripts, tests placeholder, and Cursor rules/commands/skill for the docs/versions workflow. Core `defineApi` implementation is still ahead under v0.1.0.

## 2026-10-09 — Cursor rules, skill, and commands for structure

Added always-on and path-scoped rules under `.cursor/rules/`, the `apixa-workflow` skill, and commands `/start-version`, `/implement-version`, `/check-structure`. Retargeted `/plan-change` and `/git-push` to `a2mbyd/apixa` and wired them to the docs/versions workflow.

## 2026-10-09 — Docs structure for v0.1.0

Landed the living docs layer (`architecture`, `roadmap`, `conventions`, ADRs) and the frozen coding contract under `versions/v0.1.0/`.

Next: implement Core against `versions/v0.1.0/implementation-plan.md` — `defineApi()`, configurable generated operations, Fetch transport in Core, example + tests.
