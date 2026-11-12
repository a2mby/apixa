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

## v1.8.0 behavior notes (hardening; one optional option, no new exports)

No symbol or import path changed; the generated export snapshot is unchanged. One optional property was added
(`redirectOrigins`, below). Corrections in
`apixa/core` advanced transfers and mock storage:

- `TransferControl.abort()` while a completion is in flight no longer races it: it waits for the completion to settle and
  rejects with a `ConfigError` ("The upload already finished; there is no active remote upload session."); the transfer
  itself settles with its own outcome. Previously the remote session could be aborted after the backend had completed it.
- With `concurrency > 1`, a part acknowledgment that arrives while another part is renewing and reconciling is kept
  (previously the transfer could fail with "Upload is missing required part acknowledgments.").
- Checkpoint bookkeeping is constant per acknowledgment. Checkpoint snapshots are now frozen with a shared, frozen
  `source.manifest` array and frozen `parts` entries (same shape and values); the 4 MiB serialized cap is unchanged.
- `MockFileStorage.put` checks virtual-path collisions without allocating per entry (same results, about 10x faster).
- **Secure redirects (breaking security correction, owner-approved).** The built-in fetch transport no longer lets the
  runtime follow redirects of ordinary requests (which forwards custom headers such as `X-Api-Key` to the target).
  It inspects every hop: same-origin hops are followed unchanged; a cross-origin hop fails with `SecurityError` before
  the destination is contacted; an origin listed in the new optional `redirectOrigins` (operation config, per-call and
  `ctx.request` option; also `TransportRequest.redirectOrigins`) is followed with no headers, cookies, credentials or
  body, `GET`/`HEAD` only. Browsers hide redirect destinations, so any redirect fails closed there. Presigned steps are
  unchanged. **Migration:** an API that redirected to another origin must list that origin or return the URL in a JSON
  body and use a `presigned` descriptor. This is the only public type addition in v1.8.0 (one optional property); no
  export was added or removed.
- Validation counts each occurrence of a shared object (a plain object reachable twice is serialized twice, so its files
  count twice); previously the second occurrence was skipped, which under-counted `maxFiles` / `maxTotalSize`.
- `loadDataset(id, { basePath })` (`apixa/mocking/node`) no longer resolves an `id` that points outside the datasets root.
- Documented, not changed: `session.id` from a checkpoint is passed to protocol steps verbatim (encode it; validate it on
  the backend); `concurrency` has no ceiling (author-defined); `maxResponseSize` is opt-in; a stream in the TanStack cache is
  consumer-owned; mutation variables (including `File`s) stay in the mutation cache for `gcTime`.

## v1.6.0 behavior notes (framework integration; no new exports)

No symbol or import path changed. Three corrections in `apixa/react` and `apixa/react/advanced`:

- A `File`, `Blob`, `ArrayBuffer`, `FormData` or `ReadableStream` in the arguments of a generated query identity throws
  a clear error (it would hash as `{}` and share one cache entry); use a mutation, or an explicit `keyParts` identity.
- For reads, a caller's `signal` in the call options is combined with TanStack's query signal (aborting either cancels);
  it used to be replaced by TanStack's signal.
- `dehydrate` omits queries whose data is a `Blob`, `File`, `ArrayBuffer` or `ReadableStream`; a `shouldDehydrateQuery`
  option still applies (both must agree).

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

## v1.5.0 additions (advanced mock file storage)

Additions belong to `apixa/core` and `apixa/mocking`; the curated root exports are unchanged.

- Values: `mockFileFixture(content, { name, type?, lastModified? })`, `mockFixtureRef(key)`.
- Types: `MockFileFixture`, `MockFileFixtures`, `MockFixtureRef`, `MockStorageOptions`, `MockFileFilter`.
- `MockFileStorage` accepts optional storage defaults; `put` accepts optional disk/directory/naming/
  ID generation and explicit name/lastModified metadata. Existing calls remain valid. `list` and
  `MockFilesHandle.list` add `disk` and segment-aware `path` filters.
- Existing `MockFileMeta` gains optional `disk`, `path`, `originalName` fields. Every normalized entry
  includes disk/path. UUID refs and all previous metadata/retrieval methods remain compatible.
- Resource `mock: { data, idKey?, seed?, storage?, fixtures? }` supports strict explicit fixture
  resolution. Reads infer ordinary strings; builtin File/Blob write signatures remain unchanged.
- `defineMockApi` resources accept `storage`, `fixtures`, `fileFields`, `fileLimits`. They retain
  catalog entity inference and existing string inputs while accepting File/Blob on declared fields.
  Custom callback contexts gain read-only `files`. Clients/resources now work with existing
  `mockFiles`/`resetMock` and preserve their established `MockApiError` surface.
- Managed handler writes are transactional, including `defineMockApi` mutable rows; throw, abort,
  timeout and reset before commit discard changes. Completed handler handles reject late writes.
  This intentionally strengthens earlier immediate-write semantics. External user effects and
  post-commit response middleware remain outside rollback. Shared refs survive automatic cleanup
  until their final managed owner/pin is removed. Explicit delete/clear remain destructive.
- Engine coordination members on the existing `MockStore` are marked `@internal`; they are used by
  the client engine and are not a supported public transaction product. No driver API is exported.

See [Core usage](../packages/core/README.md#advanced-mock-file-storage) and the
[architecture lifecycle contract](./architecture.md).

## v1.7.0 additions (advanced transfers; implemented, not npm-published)

Additions are specialized to `apixa/core`; curated root values and all import paths stay unchanged.

- Value: `createTransferControl` (caller-owned input with pause/resume/cancel/remote-abort methods).
- Types: `AdvancedTransferConfig`, `AdvancedTransferOptions`, `AdvancedTransferFailure`,
  `TransferProtocol`, `TransferStepContext`, `TransferCheckpoint`, `TransferPart`, `TransferPartAck`,
  `TransferSnapshot`, `TransferControl`, `TransferSessionState`, `PresignedPolicy`, `PresignedRequest`.
- Optional operation `transfer` and `presigned`; function operation `presigned`; call-option
  `transfer`/`presigned`; `ctx.transfer` and `ctx.request` presigned descriptors. Only protocol
  context requests accept explicit mixed read/write kinds. Ordinary function kinds remain fixed.
- Optional `Transport.capabilities.presigned`, `TransportRequest.security`, `ApiRequest.delegated`,
  `ApiError.advancedTransfer`. Existing custom transports remain valid for ordinary calls; delegated
  requests require capability opt-in and actual credential/redirect enforcement.
- Ordinary file requests, hooks, errors and onTransfer are unchanged. Advanced aggregate events use
  `onSession`. Checkpoint persistence is caller-owned; resume requires server inspection and strong
  chunk-manifest source identity. Checkpoints are never authoritative server state.
- Fix: `ctx.request` now forwards the already-declared maxResponseSize option into its pipeline.
- React query identities exclude transfer controls; new presigned reads require explicit safe
  keyParts so temporary signed destinations cannot enter generated keys. No new React exports.

Implemented configuration, backend obligations, security boundaries and runtime limits are in the
[Core README](../packages/core/README.md#advanced-transfers-v170). No cloud SDK, new public package,
S3 adapter framework or ranged-download API is introduced.
