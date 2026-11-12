# v1.6.0 — Implementation plan

Ordered smallest path. Prefer tests and docs over code; prefer reshaping `packages/react` over new
APIs. Batch 0 turns every suspected finding into a failing or passing characterization test, then
classifies it (defect / documented limitation / non-issue) before anything is changed.

## Baseline audit (v1.5.0 tree)

| Fact                                                                                                                                                                                                                                                         | Consequence                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/react/*` run on workspace React 19.1 only (`vitest.config.ts`, jsdom per file); CI runs Node 22 and 24                                                                                                                                                | React 18 needs runtime evidence on the **packed** artifact; jsdom `Blob` has no `arrayBuffer()`/`stream()` so assertions use `FileReader`/size/type (learned in v1.3.0) |
| `verify-react-consumers.mjs` builds React 18.3.1 + TanStack 5.90.1 and 19.1.1 + 5.104.4 consumers with jsdom installed but only type-checks/builds                                                                                                           | Extend with an executed runtime scenario; jsdom is already a consumer dependency                                                                                        |
| `verify-unified-consumer.mjs` has the Next (start/dev) consumer and React 18/19 SSR with hydration, and `query-ssr-next` is the tracked app driven by `verify-browser.mjs`                                                                                   | Binary/stream SSR scenarios belong here; the browser example gets its file scenario here (O1)                                                                           |
| `normalizeIdentity` strips `signal`, `timeout`, `retry`, `idempotencyKey`, `onTransfer`, `maxResponseSize` for operations with an options slot                                                                                                               | Verify the same holds for infinite queries, `createResourceQueryOptions`, prefetch, mutation `variables`                                                                |
| Query functions bind `context.signal` at the options position (`withOptions(..., { signal })`); mutations have no TanStack signal                                                                                                                            | Cancellation of an upload through a mutation is the caller's `AbortController` in call options                                                                          |
| Mutation `onSuccess` always `invalidateQueries({ queryKey: keys.all() })` for the resource unless `invalidate: false`; custom/flat ops use the same helper                                                                                                   | Broad by design; document scoped invalidation instead of changing it                                                                                                    |
| `dehydrate` (`hydration.ts`) is a pass-through of TanStack's `dehydrate`                                                                                                                                                                                     | Whether binary/stream queries break the RSC boundary is the Batch 0/4 question                                                                                          |
| `examples/**` is ignored except `examples/frontends/query-ssr-next`; `examples/frontends/next` (50 source files) lists `react-hook-form`; `pnpm-workspace.yaml` includes `examples/*` and `pnpm-lock.yaml` already has an `examples/frontends/next` importer | Tracking `examples/frontends/next` wholesale would drag an out-of-scope dependency and a lockfile change                                                                |
| `AGENTS.md` (generated from `.cursor/rules/*.mdc`) calls `examples/frontends/next` the only maintained example                                                                                                                                               | If the example lives elsewhere (O1), the rule must be updated at its source and regenerated                                                                             |
| Custom transports that ignore `TransportRequest.onTransfer` yield `unsupported` events (v1.3.0); sized uploads are `unsupported` in browsers and workerd                                                                                                     | A documented platform limit that hooks inherit; test and document, do not "fix"                                                                                         |

## Findings to confirm in Batch 0 (classification pending)

| #   | Suspected finding                                                                                       | Expected class (to be proven)                                                              |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| F1  | A `File`/`Blob` in a **query** argument hashes as `{}`, so different files share a cache entry          | Defect if confirmed (silent cache collision); fix = fail loudly or key by stable identity  |
| F2  | A `stream` result in the query cache is not cancelled when the entry is refetched, removed or collected | Documented limitation (+ guidance) unless a proven leak without any timeout needs a guard  |
| F3  | Prefetched binary/stream queries are dehydrated and cross the RSC boundary                              | Defect if the Next build fails or hydrates garbage; fix = default exclusion in `dehydrate` |
| F4  | `onTransfer`/`maxResponseSize` leak into identity for infinite queries, prefetch or options factories   | Defect if confirmed; otherwise non-issue with tests                                        |
| F5  | StrictMode/unmount cancellation of an in-flight binary query leaves the request running                 | Non-issue if TanStack aborts `signal` and Core cancels the body; test pins it              |
| F6  | `onTransfer` after unmount (setState on an unmounted component) or a stale closure                      | Non-issue/recipe: documented cleanup pattern with a test                                   |
| F7  | Mutation retry re-sends a replayable body and never a stream; `states.*` expose the typed error         | Non-issue (Core guarantees); hook-level test pins it                                       |
| F8  | `useResourceMutation` `onMutate` optimistic updates with `File` variables serialize into devtools/keys  | Non-issue unless `variables` enter a key; test                                             |
| F9  | jsdom/React 18 differences (missing `Blob.arrayBuffer`/`stream`, `FormData` file handling)              | Platform limitation of jsdom; consumer test uses shape assertions and records it           |
| F10 | `error` is typed loosely; `instanceof ValidationError` narrowing works across the packed ESM boundary   | Non-issue if `instanceof` holds with the packed single-module identity; test it            |

## Findings (Batch 0, recorded)

| #   | Result                                                                                                                                                                                                                                                                                                         | Class                                                   | Evidence                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | TanStack hashes `File`/`Blob`/`ArrayBuffer`/`FormData`/stream as `{}`; a generated query identity with one would silently share a cache entry. Now throws a clear error naming `keyParts`/mutations (`assertNoBinaryIdentity`, `query-options.ts`).                                                            | **Defect, fixed**                                       | `tests/react/query-identity-binary.test.tsx` (failing first: 7 tests)                                                                                                       |
| F2  | A refetch replaces a cached stream without cancelling the old one; removal/unmount do not throw; the owner can always cancel it, and the call `timeout` still ends it (no unbounded leak).                                                                                                                     | **Documented limitation**                               | `tests/react/framework-files-queries.test.tsx`; React README                                                                                                                |
| F3  | In Next 15.5 / React 19 a dehydrated `Blob` crosses the boundary (`$B`) and hydrates, but adds its bytes to the payload; a stream is consumed by serialization (single-use); React 18 / older Next Flight cannot serialize them (not verifiable locally). `dehydrate` now omits binary/stream query data (H5). | **Hardened (behavior change, owner-approved scope H5)** | spike (Next dev: blob/arrayBuffer/text/stream all rendered, `$B` in payload); `ssr-binary-dehydrate.test.ts`; `/binary` page in `verify-unified-consumer.mjs` (start + dev) |
| F4  | `onTransfer`, `maxResponseSize`, `signal`, `timeout`, `retry` are absent from identity for plain queries, list queries, infinite queries (identity is the caller's `keyParts`), prefetch and hooks.                                                                                                            | **Non-issue**                                           | `query-identity-binary.test.tsx`                                                                                                                                            |
| F5  | Unmounting an in-flight binary query aborts the request; StrictMode double mount leaves at most the surviving request.                                                                                                                                                                                         | **Non-issue**                                           | `framework-files-queries.test.tsx`                                                                                                                                          |
| F6  | Events after unmount reach the callback without throwing; the documented recipe guards state with a ref.                                                                                                                                                                                                       | **Recipe documented**                                   | `framework-files-transfer.test.tsx`; React README                                                                                                                           |
| F7  | A replayable body is re-sent by TanStack/Core retry with isolated attempt events; a validation failure is never retried and sends no request.                                                                                                                                                                  | **Non-issue**                                           | `framework-files-mutations.test.tsx`, `framework-files-transfer.test.tsx`                                                                                                   |
| F8  | Optimistic updates with `File` variables roll back when the file is rejected and are replaced by server data otherwise; variables never enter a key.                                                                                                                                                           | **Non-issue**                                           | `framework-files-mutations.test.tsx`                                                                                                                                        |
| F9  | jsdom's `Blob` lacks `arrayBuffer()`/`stream()` and a sized-body probe is `unsupported` there; the packed consumer scenarios use Node's Blob/File/FormData so bytes are exact; jsdom limits are covered by the workspace suite.                                                                                | **Platform limitation**                                 | `tests/helpers/framework-files.tsx` (`bytesOf`); `scripts/file-consumer-runtime.mjs`                                                                                        |
| F10 | `instanceof ValidationError` (and `violations` typing) works through hooks on both React versions and across the packed entry points.                                                                                                                                                                          | **Non-issue**                                           | `framework-files-errors.test.tsx`, `file-consumer-runtime.mjs`, type fixtures                                                                                               |
| F11 | **New.** A flat read through `useResource` (and any query `args`) replaced the caller's `signal` with TanStack's, so a caller's `AbortController` was silently ignored. Now combined (`bindSignal`): aborting either cancels.                                                                                  | **Defect, fixed**                                       | `framework-files-queries.test.tsx` (failing first)                                                                                                                          |
| F12 | **New (documentation).** A read called through a hook (flat or `useResourceQuery`) is a cached query: a second call inside `staleTime` is served from the cache with no request and no transfer events. The example uses the direct client for one-off downloads.                                              | **Documented behavior**                                 | browser step 10; React README                                                                                                                                               |

Also found by the Chromium run: rendering `detectTransferSupport()` during SSR caused a hydration mismatch
(server and browser differ); the example reads it after mount (documented there).

## Design decisions to lock (Batch 0)

| #   | Decision                            | Recommendation                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | No new public API by default        | The release adds tests, docs and example code. Any addition (O2) needs a failing test, a written reason and owner approval.                                                                                                                                                                         |
| H2  | Progress consumption                | Keep `onTransfer` as the only mechanism. Document a `useState` recipe (per-call option for mutations; `args` option for queries) including unmount cleanup and a fixed pattern for percent (`loaded / total` only when `total` is defined). Test it on React 18/19. Revisit a hook only through O2. |
| H3  | Query identity for binary arguments | If F1 is confirmed, make `normalizeIdentity` throw a clear `ConfigError` for `File`/`Blob`/`ReadableStream` inside query args (uploads belong to mutations); no silent collision. No behavior change otherwise.                                                                                     |
| H4  | Streams in queries                  | Recommend streams for direct calls and mutations. A stream held by a query is the app's to consume or cancel; document it. Add a guard only if Batch 0 shows an unbounded leak that the call `timeout` cannot end.                                                                                  |
| H5  | Dehydration of binary data          | If F3 is confirmed, `dehydrate` from `apixa/react/advanced` excludes queries whose data is a `Blob`, `File`, `ReadableStream` or `ArrayBuffer`-like by default (a user `shouldDehydrateQuery` still composes). Otherwise document.                                                                  |
| H6  | Invalidation                        | Keep resource-wide invalidation as the default; document `invalidate: false` + `cache` controller recipes for file-scoped invalidation; tests assert other resources are untouched. No change.                                                                                                      |
| H7  | Errors                              | No new guard or type helper. Document `instanceof` narrowing with `ValidationError.violations`; test propagation through query `error`, mutation `error`/`states.*.error` and rejected promises, on both React versions.                                                                            |
| H8  | React 18 runtime verification       | Execute a scenario script in the **packed** React 18.3.1 / TanStack 5.90.1 consumer (and 19) with jsdom and `@testing-library/react` as consumer-only devDependencies; share one scenario source between versions. Keep workspace tests on React 19.                                                |
| H9  | Example placement (see O1)          | Recommend adding the file scenario to the tracked, CI-driven `examples/frontends/query-ssr-next` (new route(s) ported from the playground's `/test/files`, without `react-hook-form`), driven by `verify-browser.mjs`; update the example rule in `.cursor/rules` and regenerate `AGENTS.md`.       |
| H10 | Mock + hooks                        | Use the existing mocking entry through hooks; test fixtures, namespaces, validation and downloads with per-test `resetMock`; no mock changes.                                                                                                                                                       |
| H11 | Custom-transport limits             | Document that hooks inherit `unsupported` transfer events from transports that ignore `onTransfer`; test with a custom transport through a hook.                                                                                                                                                    |
| H12 | Runtime detection                   | Reuse `detectTransferSupport()`; the example shows reading it to adapt UI (no new helper).                                                                                                                                                                                                          |

### Owner decisions (escalate only these)

- **O1 — Where the tracked example lives.** `AGENTS.md` names `examples/frontends/next` (ignored, local) as the
  only maintained example; the only tracked CI-driven Next app is `examples/frontends/query-ssr-next`. Options:
  (a) **recommended** add the scenario to `query-ssr-next` and update the rule; (b) allowlist
  `examples/frontends/next` in `.gitignore` and track it (50 files, `react-hook-form`, lockfile importer change,
  Tailwind). Option (a) has the smaller blast radius and is already verified by `pnpm verify`.
- **O2 — Any new public API** (a progress hook, an `isValidationError` guard, a `dehydrate` option).
  Default: none. Each needs a failing Batch 0 test and approval.

## Locked decisions (Batch 0, recorded)

H1 no new public API (O2): none added; three behavior corrections recorded in `docs/public-api.md`. H2 progress =
`onTransfer` + user state, recipe documented and tested. H3 binary query identity throws (F1). H4 streams in queries:
documented, no guard (F2). H5 `dehydrate` omits binary/stream data, composable with `shouldDehydrateQuery` (F3).
H6 resource-wide invalidation unchanged; the existing `invalidate` option (`"lists"`, `{ details }`, function,
`false`) is the scoped recipe. H7 no guard/type helper; `instanceof` narrowing. H8 packed React 18.3.1 + TanStack
5.90.1 and React 19 runtime scenarios (`scripts/file-consumer-runtime.mjs`, run by `verify-react-consumers.mjs`, which
already executes a hook runtime) — no new devDependencies (React DOM `act` + jsdom). H9/O1 the tracked scenario lives
in `examples/frontends/query-ssr-next` (`/files`), the example rule source `.cursor/rules/*.mdc` is updated and `AGENTS.md`
regenerated with `scripts/sync-agent-rules.sh`. H10–H12 as recommended (no mock changes; documented transport limits;
`detectTransferSupport()` reused, read after mount).

Deviations from the contract:

- The consumer runtime extends the existing `scripts/verify-react-consumers.mjs` flow with a standalone script rather
  than a shared `scripts/lib/react-runtime-scenarios.mjs`; it uses React DOM `act` and jsdom only (no
  `@testing-library/react` in the consumer).
- `framework-files-types` is a `.test.tsx` (it renders hooks); the rest of the file names follow the plan.
- `verify-edge.mjs` is unchanged (no React hooks run there); it still passes with the `dehydrate` change.
- `spike-framework-files.mjs` was not kept: the F3 spike used a temporary page in `examples/frontends/query-ssr-next` (removed);
  its result is recorded in the findings table.
- The F3 hardening changes `dehydrate`'s behavior for binary data (previously it worked on React 19); recorded as a
  behavior note, not an API change.

## Batches

### Batch 0 — Audit and characterization (no production change)

- Write characterization tests for F1–F10 on workspace React 19 (`tests/react/framework-files-*.test.tsx`,
  `tests/react/query-identity-binary.test.tsx`), plus a Next SSR probe in a throwaway consumer
  (`scripts/spike-framework-files.mjs`, not shipped) for F3 and F2. Each test passes (non-issue /
  documented limitation) or fails (defect) and is classified in a "Findings" section here.
- Inventory `examples/frontends/next`'s file scenario (pages, `lib/file-upload-demo.ts`, mock setup) for the
  port, and record O1/O2 answers. Lock H1–H12.

### Batch 1 — Hook-level runtime matrix (workspace React 19)

- Scenarios through all three hooks: upload with progress (known/unknown totals, `unsupported`),
  download as Blob/ArrayBuffer/text, cancellation (mutation `AbortController`, query unmount,
  StrictMode), timeout, retries, stream results, validation errors with typed `violations`,
  `HttpError` bodies, `NetworkError`, mocks with fixtures/namespaces/validation/downloads,
  invalidation scope, optimistic updates with files, `states.*`, `reset`. Reuse `tests/helpers/*`.

### Batch 2 — Defect fixes (only what Batch 0 proved)

- Smallest change in `packages/react` per proven defect (candidates: H3, H5, H4), each with its failing
  test written first. If none is proven, this batch is empty and says so.

### Batch 3 — React 18/19 runtime on packed consumers

- `scripts/lib/react-runtime-scenarios.mjs` (shared scenario source) executed by
  `verify-react-consumers.mjs` in the React 18.3.1 + 5.90.1 and 19.1.1 + 5.104.4 consumers with
  jsdom and `@testing-library/react` (consumer-only): upload/progress, download, cancel, validation
  error, mock fixture round trip, invalidation. jsdom limits handled with shape assertions.

### Batch 4 — Next.js SSR/hydration

- `verify-unified-consumer.mjs` Next consumer (start + dev): a Server Component prefetching serializable
  data hydrates without refetch; a Blob/stream download is performed server-side without crossing the
  boundary; the documented safe pattern is asserted; H5 behavior (guard or documentation) verified in
  a real build. Stream ownership in a Server Component asserted.

### Batch 5 — Tracked example

- Port the playground's file scenario (upload with rules, download, progress, cancel, validation error,
  mock storage listing) to the location chosen in O1; driven by `verify-browser.mjs` in Chromium
  (rejected file makes no request, progress visible, cancel ends the transfer). Update the example
  rule source (`.cursor/rules/*.mdc`) and regenerate `AGENTS.md` if O1(a); no generated artifacts.

### Batch 6 — Types and packed fixtures

- Extend `scripts/lib/type-consumer-fixtures.mjs`/`verify-type-consumers.mjs`: hook returns for file
  inputs, `onTransfer`, binary results and `ValidationError.violations` across the matrix; workspace
  `tests/react/*types*` additions with `IsAny` checks.

### Batch 7 — Cross-runtime, docs, verification

- Edge/workerd/Node checks that the file system still behaves with the React entry's server-safe
  `advanced` export; document runtime limits table. Docs: React README (files with hooks, progress
  recipe, binary/SSR rules, errors, limitations), architecture, public API (only if changed),
  `examples/README.md`, story, roadmap, context. Tick criteria with evidence; run complete
  `pnpm verify`.

## Expected file changes

`tests/react/`: `framework-files-*.test.tsx`, `query-identity-binary.test.tsx`, additions to existing
suites only if unavoidable; `tests/helpers/` (hook harnesses). `packages/react/src/`: only proven fixes
(`query-options.ts`, `hydration.ts`). `scripts/`: `verify-react-consumers.mjs`,
`verify-unified-consumer.mjs`, `verify-type-consumers.mjs`, `verify-browser.mjs`, `verify-edge.mjs`,
`lib/react-runtime-scenarios.mjs` (new), `lib/type-consumer-fixtures.mjs`, `spike-framework-files.mjs`
(new, unshipped). `examples/frontends/query-ssr-next/**` (or per O1), `examples/README.md`, `.gitignore` (O1b
only). Docs: `packages/react/README.md`, `docs/architecture.md`, `docs/public-api.md` (if API changes),
`docs/context.md`, `docs/roadmap.md`, `docs/story.md`, `versions/README.md`, `versions/v1.6.0/*`,
`.cursor/rules/*.mdc` + `AGENTS.md` (O1a).

## Testing strategy

- **Order:** characterization first (Batch 0), then failing tests for each proven defect, then fixes.
  Runtime hook tests use the existing `tests/helpers/query.tsx` harness, injectable/fake transports and
  loopback servers only for byte-level wire facts; no live network.
- **Layers:** hook runtime (workspace) → packed React 18/19 runtime → packed type consumers → Next
  SSR/hydration → Chromium → Node/Edge/workerd.
- **React versions:** the identical scenario source runs on React 18.3.1 + TanStack 5.90.1 (minimum
  peers) and React 19.1.1 + 5.104.4, against the packed tarball; assertions avoid jsdom-missing APIs.
- **Invariants:** no `any` in hook results; `onTransfer`/`maxResponseSize` never in a query key; a
  rejected file never issues a request and never touches `mockFiles()`; a `ValidationError` is never
  retried; unmount cancels in-flight work; stream ownership never silently outlives its owner.
- **Backward compatibility:** every v1.1.0–v1.5.0 test passes unedited; hook signatures/keys/invalidation
  asserted unchanged.
- **Final gate:** `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck &&
pnpm test && pnpm verify:consumers && pnpm verify:browser && pnpm verify:edge` (i.e. `pnpm verify`).

## Explicit non-steps

No new hook, transfer registry, form-state or progress store; no React Hook Form or Zod; no new
package or dependency; no change to default invalidation, query identity (except H3 if proven), error
classes or `onTransfer` semantics; no chunking, presigned URLs, storage adapters or drivers; no
unrelated example touched; no generated artifacts (`node_modules`, `.next`, `*.tsbuildinfo`) tracked;
no commit, publish or version bump as part of implementation.
