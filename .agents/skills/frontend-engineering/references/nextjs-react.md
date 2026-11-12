# Framework placement and runtime boundaries

**Why it exists:** Maps the ownership model onto React/Next.js (and Vue, Svelte, Angular) and records this repo's compatibility notes.
**Use when:** implementing React/App Router code or translating the model to another framework.
**Do not use when:** the code is framework-agnostic logic; keep it free of framework imports.

## React / Next.js (App Router)

Before writing Next.js code, resolve the installed `next` package from the app and read the relevant guide under `node_modules/next/dist/docs/`. Check route conventions, caching APIs, and deprecations against that version, not memory. This repo currently hoists the package to the root.

| Concern                                | Default                                                                                   | Exception                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Route files (`page.tsx`, `layout.tsx`) | Thin: compose feature components, fetch through a server loader/client, no business logic | None                                                                                                                      |
| Server vs client                       | Server Component; `"use client"` at the smallest interactive leaf                         | Whole subtree needs browser state; put the boundary at its nearest owner                                                  |
| Data fetching                          | Server-side route/feature loader; no mirroring server data into a client store            | Realtime/optimistic UI takes ownership through one client cache                                                           |
| Server data on client                  | TanStack Query or the existing equivalent as single owner                                 | Static server data passed as props; retain an existing simple request owner when a new cache would add no needed behavior |
| Mutations                              | Server Actions or one API client per capability                                           | Existing project convention wins; apply the minimal-server-surface rules                                                  |
| Colocation                             | `app/<route>/_components` for route-only code; `features/` for reusable capabilities      | Framework-mandated paths or an established feature owner for that route                                                   |
| Context/global store                   | Last resort; name the owner in the Module Map for Complex work, otherwise under State     | Auth, theme, i18n can use app providers directly; keep their scope explicit                                               |

Client boundaries include their imported dependency graph: a small file importing a giant barrel is not a small browser bundle. Keep server-only configuration unreachable from client entries; use intentional runtime-specific entries if mixing exports would leak it.

For server-to-client handoff, pass serializable contract/model data. If hydrating a query cache, hand ownership to that cache; do not independently refresh both props and cache. Mark drafts and their commit/reset lifecycle separately. Fetch in parallel only for independent reads; define which sections survive a partial failure.

Tradeoff: server rendering solves public first-render/SEO needs with less client code, at the cost of runtime and cache boundaries. Avoid adding it to purely local interaction; misuse leaks secrets through imports or produces stale duplicate data. Choose rendering per route using [minimal Next.js surface](nextjs-minimal-surface.md).

## Vue / Svelte / Angular

Apply the same Ownership Ladder; map framework tools to the owning module rather than global technical buckets.

| Framework | State/behavior owner                                           | Public boundary                                             | Exception to local placement                       |
| --------- | -------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Vue       | Module composable; Pinia store only for shared consumers       | Module entry exporting components/composables               | App initialization and app-wide providers          |
| Svelte    | Component state or module store/runes                          | Module entry exporting components and intentional state API | Framework route/server file locations              |
| Angular   | Feature-scoped service/signal; component for local interaction | Feature entry exporting components/services                 | Root service only for genuine application lifetime |

These mappings solve framework consistency at the cost of maintaining one explicit scope; avoid a store/service when component state suffices; globalizing every helper couples unrelated workflows.

## A Square compatibility notes

Use these as navigation clues and confirm the current files during Locate:

- Start with root `AGENTS.md`, `docs/ARCHITECTURE_CURRENT.md`, `docs/RULES.md`, and `docs/FRONTEND_RULES.md`. Root ownership rules supersede historical PublicApi/deployment descriptions and stale root-layout examples. Active web source lives under `apps/web/src`.
- `app/contact/page.tsx` demonstrates route composition through loaders and feature components. `features/service-request/hooks/useServiceRequestForm.ts` separates picker navigation from the Details form's state. Follow the active consumer, not only a folder template in older docs.
- `features/cms/index.ts`, `model/`, `editor/transactions/`, and `server/` demonstrate subsystem ownership. Root ESLint already restricts model-to-editor and design-token dependencies; preserve those rules while extending enforcement.
- `shared/lib/api/api.ts` and `api.browser.ts` intentionally separate server GET wiring from browser submissions/CMS. Preserve these runtime-safe surfaces and their shared factories/parsers. “One client” means one contract/parsing/error authority per capability, not one barrel that mixes secrets into browser imports.
- Some domain DTOs, API code, and CMS state already live in `shared/`, and some consumers deep-import them. This differs from the skill's target. Preserve existing routes during scoped work; flag relevant ownership debt and migrate only when that boundary is the requested problem. Add no new domain-wide promotion by analogy.
- ASquare-System owns business rules and persistence; `apps/api` owns the HTTP BFF. Communicate across apps via HTTP; cross-app contracts belong in `@a-square/contracts`. Inspect the live package before consuming a contract; its presence alone does not mean all endpoint shapes are defined there.
- Existing form flows use React Hook Form/Zod and colocated schemas; installed dependencies include Zustand, but no TanStack Query. Do not install a second state/data framework to comply with a default.
- This skill update does not change active API base URLs, wire `BFF_INTERNAL_URL`, or move existing integrations. Discover actual routing in the clients and Express routes; older “health only” summaries do not describe all current handlers.

Preserving these conventions solves incremental compatibility, costs retaining known placement debt, and is unsuitable when that debt is the named bug. Treating exceptions as global templates perpetuates the debt.
