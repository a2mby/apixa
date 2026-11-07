# Public API contract

Export contracts for every publishable entry point. Everything here is **implemented** unless it
says **planned**. Symbol lists live in the entry files; this document fixes which entry owns which
area and what must stay compatible. Checks: `tests/facade/`, `pnpm check:architecture`,
`pnpm verify:consumers`.

## Packages

| npm package      | Source             | Role                                            |
| ---------------- | ------------------ | ----------------------------------------------- |
| `apixa`          | `src/` (root)      | Facade: re-exports only; one install            |
| `@apixa/core`    | `packages/core`    | Framework-independent engine                    |
| `@apixa/mocking` | `packages/mocking` | `defineMockApi`, datasets                       |
| `@apixa/react`   | `packages/react`   | React integration; TanStack Query is the engine |

`@apixa/internal-shared` (`packages/internal/shared`) is private and never published. All four
packages share one version (`1.0.0-rc.0`), require Node.js 22+, and are ESM only.

## Entry points

| Import path                                                                                        | Exposes                                                                                                                                      | Loads React/TanStack? | Side effect |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------- |
| `apixa`                                                                                            | Curated: `defineApi`, `defineApis`, `defineMockApi`, errors, transport, retry and transform helpers, operation metadata, essential types     | no                    | none        |
| `apixa/core`                                                                                       | Everything `@apixa/core` exports                                                                                                             | no                    | none        |
| `apixa/mocking`                                                                                    | Everything `@apixa/mocking` exports                                                                                                          | no                    | none        |
| `apixa/mocking/register`                                                                           | Lets `mock: "<dataset-id>"` load named datasets                                                                                              | no                    | **yes**     |
| `apixa/mocking/datasets` (+ `/users`, `/products`, `/companies`, `/orders`, `/posts`, `/comments`) | Typed records and `loadDataset`; each module on its own                                                                                      | no                    | none        |
| `apixa/mocking/node`                                                                               | Filesystem dataset loaders (`node:fs`)                                                                                                       | no                    | none        |
| `apixa/react`                                                                                      | `ApixaProvider`, `QueryClient`, `ApixaHydrationBoundary`, `useResource`, `useResourceQuery`, `useResourceMutation` and types. `"use client"` | yes                   | none        |
| `apixa/react/advanced`                                                                             | `QueryClient`, `dehydrate`, prefetch helpers, controllers, query options, optimistic layers. Server-safe: never reaches `react`              | TanStack only         | none        |

`@apixa/core`, `@apixa/mocking` (same subpaths, without the `apixa/` prefix and with `datasets/<name>`
as above) and `@apixa/react` (`.` and `./advanced`) expose the same objects: `apixa/*` re-exports
them and bundles none of them.

Removed: `apixa/tanstack-query` and `apixa/tanstack-query/advanced` (they existed only in the
unpublished root manifest). `@apixa/tanstack-query` was never published to npm.

### Curated root

Values (29): `defineApi`, `defineApis`, `defineMockApi`; `ApiError`, `NetworkError`, `HttpError`,
`ParseError`, `ValidationError`, `TimeoutError`, `AbortError`, `ConfigError`, `SecurityError`,
`TransformError`, `MockError`, `MockApiError`, `InvalidSliceError`, `isApiError`, `isHttpError`,
`isTimeoutError`, `isMockError`; `createFetchTransport`, `computeBackoffMs`, `parseRetryAfter`,
`isRetryableStatus`; `convertKey`, `transformKeys`, `KEY_CASES`; `OPERATION_METADATA`,
`getOperationMetadata`. The exact list is `tests/facade/curated-root-exports.json`, shared by the
unit test and the packed-consumer check. Types are listed in `src/index.ts`.

Everything else (`MockStore`, `resetMock`, `registerMockDatasetLoader`, `createIdempotencyKey`,
`expandOperations`, the dataset helpers, all hooks) lives under its specialized subpath.

## Install matrix

| Goal             | Install                                                      |
| ---------------- | ------------------------------------------------------------ |
| Core and Mocking | `npm install apixa`                                          |
| Plus React       | `npm install apixa @apixa/react react @tanstack/react-query` |
| A single package | `@apixa/core`, `@apixa/mocking` (peer: Core), `@apixa/react` |

`apixa` depends on `@apixa/core` and `@apixa/mocking`. `@apixa/react`, `react` and
`@tanstack/react-query` are optional peers of `apixa`, so a Core-only install never pulls React.
Importing `apixa/react` without `@apixa/react` fails with a module-not-found error naming it.

## Runtime support

Verified by `pnpm verify` (CI: Node 22 and 24): Node.js 22 and 24; Chromium (a real browser, against
the Next.js SSR example in production and development mode); Cloudflare Workers (the `workerd`
runtime, no `nodejs_compat`) and the Vercel Edge Runtime (`edge-runtime`) running the packed
facade (`apixa`, mocking with inline records, named datasets and `defineMockApi`, the fetch
transport, `apixa/react/advanced`); React 18 and 19; Vite 6; Next.js 15 (App Router, Server
Component prefetch, `ApixaHydrationBoundary`). `apixa/mocking/node` is Node-only by design.
Not verified: Deno, Bun, React Native, or platform-hosted Workers/Edge deployments (the runtimes
above are the platforms' own engines, not deployed services).

## Compatibility rules

- Do not remove or rename an existing import path without recording its compatibility impact here
  and in `docs/story.md`.
- Facade files only re-export. `apixa/react` lists names explicitly (a client boundary may not use
  `export *`); `pnpm check:architecture` keeps it equal to `@apixa/react`'s export list.
- Hook signatures, error text and declaration shapes of public symbols stay stable. User-facing
  messages name `apixa/...` first and mention the `@apixa/...` spelling.
- No private specifier (`@apixa/internal-*`) may appear in published JavaScript or declarations.
- `apixa` and `@apixa/core` work with neither React nor TanStack Query installed.

## Compatibility notes for this release

- `@apixa/react` now depends on Core through a caret peer range (`^1.0.0-rc.0`); it was an exact
  `workspace:*` pin as `@apixa/tanstack-query`.
- `QueryClient` (Apixa) extends TanStack's. A plain TanStack `QueryClientProvider` keeps working;
  `ApixaProvider` is optional.
- `@apixa/react` is now one code-split build. Before, its entries were bundled separately, so
  `@apixa/react` and `@apixa/react/advanced` carried two copies of shared modules.
- npm already lists an `apixa@0.1.0` placeholder owned by the project maintainer. Publishing needs the
  `@apixa` npm scope or organization to exist and be controlled by the project (not verified).
