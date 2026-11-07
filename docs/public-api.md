# Public API contract

Export contracts for every publishable entry point. Everything here is **implemented** unless it
says **planned**. Symbol lists live in the entry files; this document fixes which entry owns which
area and what must stay compatible. Checks: `tests/facade/`, `pnpm check:architecture`,
`pnpm verify:consumers`.

## Distribution and private modules

Only `apixa` is published (`1.0.0-rc.0`, ESM, Node.js >=22). `packages/core`, `packages/mocking`,
`packages/react` and `packages/internal/shared` are private workspace modules. Their `@apixa/*`
names are for development; the public distribution imports none of those names. The facade in
`src/` only re-exports canonical implementations, compiled together into shared runtime chunks.

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

All public subpaths share the same Core implementation and types. React and advanced share
one QueryClient, mutation store and optimistic layer. No separately installed implementation
package is needed. Declarations preserve canonical modules using relative paths under `dist/types`.

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

| Goal             | Install                                         |
| ---------------- | ----------------------------------------------- |
| Core and Mocking | `npm install apixa`                             |
| React            | `npm install apixa react @tanstack/react-query` |

React (`^18.0.0 || ^19.0.0`) and TanStack Query (`^5.90.1`) are optional peers. Root/Core/Mocking
work without them. Importing a React entry without its peers produces a native module-not-found
error. Future framework integrations will use their own subpaths and optional peers; Vue and
Angular are not implemented.

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
  messages recommend only `apixa/...`.
- No private specifier (`@apixa/*`) may appear in published JavaScript or declarations.
- `apixa` and `apixa/core` work with neither React nor TanStack Query installed.

## Compatibility notes for this release

- The unpublished four-package RC plan is superseded by [ADR 005](./decisions/005-single-package-distribution.md).
  `@apixa/core`, `@apixa/mocking` and `@apixa/react` are now private development modules, not
  supported npm installation paths. Every existing `apixa` subpath and its exported symbols stay unchanged.
- `QueryClient` extends TanStack's. Native TanStack providers remain compatible; `ApixaProvider` is optional.
- The registration and Node-loader errors now recommend only the public `apixa/mocking/*` paths.
  Error codes and execution behavior are unchanged.
- The export snapshot retains the 13 private module entries as compatibility references alongside
  the 14 public entries. No symbol list changed in this migration.
- The unscoped `apixa` package belongs to the project maintainer. No npm organization scope is needed.
