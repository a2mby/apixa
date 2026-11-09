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

| Goal             | Install                                   |
| ---------------- | ----------------------------------------- |
| Core and Mocking | `npm install apixa`                       |
| React            | `npm install apixa @tanstack/react-query` |

Core-only consumers need only `npm install apixa`. `apixa/react` requires React (`^18.0.0 || ^19.0.0`,
already present in a React app) and TanStack Query (`^5.90.1`) to be installed **in the consuming
application**; both stay optional peers, so root/Core/Mocking work without them and npm does not
install them automatically. Importing a React entry without its peers produces a native
module-not-found error. Without TanStack Query the three hooks' results are typed
`ApixaMissingPeer_Install_tanstack_react_query` (a compile error on first use that names the fix),
never `any`; see the troubleshooting note in the root README. Future framework integrations will
use their own subpaths and declare their own optional peers; Vue and Angular are not implemented.

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

## v1.4.0 additions (file validation and safety)

New in `apixa` (root) and `apixa/core`; nothing existing changed.

- Types: `FileRules`, `FileLimits`, `FileViolation`, `FileViolationCode`. `FileFieldOptions` now extends
  `FileRules` (additive).
- Config: rules on `fileFields` options; resource and operation `fileLimits`; operation `fileFields`
  (rule overrides), `maxResponseSize`, `responseAccept`; per-call and `ctx.request` `maxResponseSize`;
  optional `TransportRequest.limits`.
- Errors: `ValidationError.violations` (empty for the existing path-parameter errors); file failures use
  `code: "VALIDATION"`, `retryable: false`.
- Behavior: nothing happens unless configured. A rejected request makes no network call and no mock write.
  `maxResponseSize` is not part of query keys. The validator's `maxSize`-style option names are now valid
  `fileFields` options (they were rejected as unknown before).
- Not included: content sniffing, per-call bypass, new hooks, new packages.

## v1.3.0 additions (transfer progress and streaming)

New in `apixa` (root) and `apixa/core`; nothing existing changed.

- Values: `detectTransferSupport` (feature probes only).
- Types: `TransferEvent`, `TransferObserver`, `TransferDirection`, `TransferPhase`, `TransferSupport`,
  `TransportTransferEvent`.
- Config: `onTransfer` on per-call `RequestOptions`, declarative operations and `ctx.request({ ... })`;
  optional `TransportRequest.onTransfer` for transports; optional `ApiError.transfer`.
- Behavior: without `onTransfer` nothing is wrapped. A `responseType: "stream"` result now keeps the
  call's signal and timeout until it is consumed (previously they were released when the Promise
  resolved). `ReadableStream` request bodies are sent with `duplex: "half"` (previously rejected by
  fetch). Inline callbacks in call options are now contextually typed (`getById("1", { onTransfer: (e) => ... })`).
- Not part of query keys in `useResourceQuery` / `useResource`.

## v1.2.0 additions (downloads and binary responses)

New in `apixa` (root) and `apixa/core`; nothing existing changed.

- Values: `parseContentDisposition` (pure, never throws).
- Types: `ContentDisposition` (root, `/core`); `MockFilesHandle` (`/core`, the type of the new `files`
  property of the `mock` handler context).
- Config: declarative operation `responseType` (`"json" | "text" | "blob" | "arrayBuffer" | "stream"`);
  a literal value types the result. Per-call `responseType` and `ctx.request({ responseType })` are typed
  too (previously untyped).
- Behavior, only for explicit non-JSON modes: a 204/205 returns `""` / empty `Blob` / empty
  `ArrayBuffer` instead of `null`; an error response is parsed by content type instead of read as the
  requested binary type; an unknown `responseType` throws `ConfigError` instead of acting as JSON; binary
  results skip key transforms and JSON shaping. JSON behavior is unchanged.
- Mocks: handlers receive `files`; mocked results are coerced to `responseType` with content headers;
  mocked `stream` is `MOCK_UNSUPPORTED`.

## v1.1.0 additions (file handling)

New in `apixa` (root), `apixa/core` and `apixa/mocking` where noted; nothing existing changed.

- Values: `SerializationError`, `mockFiles` (root, `/core`, and `mockFiles` also `/mocking`);
  `MockFileStorage`, `isMockFileRef` (`/core`, `/mocking`).
- Types: `FileFieldsConfig`, `FileFieldOptions`, `MultipartOptions`, `DataFormat`, `MockFileMeta`,
  `MockStoredFile` (root, `/core`; the mock types also `/mocking`).
- Config: resource `fileFields` and `multipart`; operation `dataFormat` and `multipart`;
  `ctx.request({ dataFormat })`. New error code `SERIALIZATION`.
- Behavior: a body containing `File` / `Blob` now becomes multipart instead of `{}`-corrupted JSON;
  a caller-built `FormData` is sent without `Content-Type` so the boundary is generated. Bodies
  without binary values are encoded exactly as before. Mocked writes carrying binary values store
  them in the client's file store.
