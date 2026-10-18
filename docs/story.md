# Story

Project log. Newest entry first.

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
