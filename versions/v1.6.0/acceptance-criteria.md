# v1.6.0 — Acceptance criteria

Tick an item only with verified evidence (test name, command output or script result).

## Audit and decisions

- [x] Batch 0 characterization tests exist for F1–F10, each classified in `implementation-plan.md` as defect, documented limitation or non-issue, with evidence; no defect is waived
- [x] H1–H12 are locked in `implementation-plan.md`; O1 (example location) and O2 (any new API) are answered by the owner and recorded
- [x] No v1.1.0–v1.5.0 test was edited to make this milestone pass (any justified edit is listed explicitly)

## Transfer through the hooks (runtime)

- [x] `useResourceMutation` and `useResource` mutations: upload with `onTransfer` delivers start/progress/complete with known and unknown totals, `unsupported` where the runtime/transport cannot observe, and attempt-isolated events on retry
- [x] `useResourceQuery` / `useResource` query downloads (Blob, ArrayBuffer, text) report progress through `args`' `onTransfer` and still cache, `select`, refetch and share one cache entry regardless of the callback
- [x] Cancellation: a mutation's `AbortController` aborts an in-flight upload/download (`AbortError`, one `abort` event); unmounting or StrictMode double-mount cancels an in-flight query request; no stale `setState` after unmount in the documented recipe
- [x] Timeout: a call `timeout` surfaces `TimeoutError` through hooks (query `error`, mutation `error`, rejected promise) for a stalled upload and download
- [x] Streams: a `stream` result obtained through a hook keeps Core's cancellation/timeout ownership; the behavior on refetch, removal and unmount is pinned by tests and documented (F2)
- [x] A custom transport that ignores `onTransfer` works through hooks and reports `unsupported`, documented as a platform limit

## Mutations and queries with files

- [x] Native TanStack mutation states, per-operation `states.*`, `reset`, `onMutate`/`onError`/`onSettled`, optimistic updates and mutation retries work with `File`/`Blob`/`FormData` bodies; a stream body is never retried
- [x] File create/update/replace/delete invalidates the resource's queries and no other resource's; the scoped-invalidation recipe (`invalidate: false` + cache controller) is documented and tested
- [x] Binary query results cache and refetch correctly client-side; `File`/`Blob`/`ReadableStream` in a query argument cannot silently collide in the cache (F1 resolved per H3)
- [x] `onTransfer`, `maxResponseSize`, `signal`, `timeout`, `retry` and `idempotencyKey` are absent from query identity for plain queries, infinite queries, `createResourceQueryOptions` and prefetch (F4)

## Errors

- [x] `ValidationError` (typed `violations`, never names or contents), `HttpError` (with body), `AbortError`, `TimeoutError`, `NetworkError` and transfer `error` events reach query `error`, mutation `error`, `states.*.error` and rejected promises on React 18 and 19
- [x] `instanceof` narrowing and `violations` typing are verified in workspace tests and in packed declarations; a `ValidationError` is never retried by the hooks

## Mocks through the hooks

- [x] `defineMockApi` / resource mocks with v1.5.0 fixtures, namespaces, listing, validation rules and downloads work through the hooks: a rejected file leaves the store and cache untouched, accepted writes invalidate and refetch, downloads return stored bytes, `resetMock` isolates tests
- [x] No mocked call reaches the network (transport that throws on use)

## Next.js SSR and hydration

- [x] Server Components can download a Blob/stream server-side without it crossing the Server→Client boundary; the safe pattern is asserted in `next start` and `next dev`
- [x] Serializable prefetched data hydrates without refetch (existing behavior preserved); binary/stream queries are handled per H5 (excluded from dehydration or documented), verified in a real Next build (F3)
- [x] Stream ownership in a Server Component is verified (cancelled/consumed server-side, never serialized)

## React 18 / 19 runtime and packed consumers

- [x] One shared scenario source executes real hooks (render, upload with progress, download, cancel, validation error, mock fixture round trip, invalidation) against the **packed** package on React 18.3.1 + TanStack 5.90.1 and on React 19.1.1 + TanStack 5.104.4
- [x] jsdom limitations (`Blob.arrayBuffer`/`stream`) are handled with shape assertions and noted, not hidden
- [x] The existing packed consumer matrix still passes (Core-only, React 18/19, optional peers, missing-peer detection, TypeScript 5.5.4 / 5.9.3 / latest, bundler and nodenext, `skipLibCheck` on/off)
- [x] Hook-return type assertions for file inputs, `onTransfer`, binary results and `ValidationError.violations` (no `any`) pass in packed declarations

## Tracked example

- [x] A tracked Next.js example (location per O1) demonstrates upload with rules, download, progress, cancellation and a rejected file, uses only `apixa/...` imports, has no `react-hook-form`, and tracks no generated artifacts (`node_modules`, `.next`, `*.tsbuildinfo`)
- [x] `pnpm verify`'s Chromium step drives it: a rejected file sends no request, progress is visible, cancel ends the transfer, a download is byte-exact
- [x] The example rule source (`.cursor/rules/*.mdc`) and regenerated `AGENTS.md` match the chosen location (if changed)

## Cross-runtime and compatibility

- [x] Chromium, Node, Next SSR (`start`/`dev`), Vercel Edge and workerd verification still pass; runtime-specific limits (browser sized-upload progress, workerd streaming uploads, jsdom Blob) are accurately documented
- [x] Core still has no React/Next/TanStack imports; `pnpm check:architecture` passes; no new package or dependency; React and TanStack remain optional peers
- [x] All v1.1.0–v1.5.0 behavior, public contracts and tests are preserved; any public API addition is explicitly owner-approved (O2) and recorded in `docs/public-api.md` and the snapshot

## Documentation

- [x] `packages/react/README.md` documents files with the hooks, the progress recipe, cache and SSR rules for binary values, error narrowing, runtime limits and the invalidation recipe, marking implemented vs planned
- [x] `docs/architecture.md`, `examples/README.md`, `docs/story.md`, `docs/roadmap.md`, `docs/context.md` and `versions/README.md` reflect the implemented state, including how the React 18 runtime gap was closed

## Verification gate

- [x] `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck && pnpm test` pass
- [x] `pnpm verify:consumers`, `pnpm verify:browser`, `pnpm verify:edge` pass
- [ ] Complete `pnpm verify` passes, and CI (Node 22 and 24) is green

## Evidence

- **Findings F1–F12** and locked H1–H12: `implementation-plan.md`. Fixes written test-first: F1 (`tests/react/query-identity-binary.test.tsx`, 7 failing tests before), F3 (`tests/react/ssr-binary-dehydrate.test.ts`, 2 failing before), F11 (`tests/react/framework-files-queries.test.tsx`, 2 failing before). Existing tests unedited.
- **Hooks at runtime (workspace, React 19):** `framework-files-transfer`, `-mutations`, `-queries`, `-errors`, `-mocks`, `-types`, `query-identity-binary`, `ssr-binary-dehydrate` (`tests/react/`); `tests/react` also passes on Node 22.
- **React 18 and 19 runtime on the packed package:** `scripts/file-consumer-runtime.mjs`, executed by `verify-react-consumers.mjs` in React 18.3.1 + TanStack 5.90.1 and React 19.1.1 + 5.104.4 (standalone and with mocking): query download with progress, typed `ValidationError`, accepted upload + invalidation, cancellation, timeout, counted stream upload, mock fixtures and reset ("React 18 / 19: file runtime scenarios passed").
- **Next.js:** `/binary` page in `verify-unified-consumer.mjs` (start + dev): only the serializable query is dehydrated; the Server Component reads the bytes itself. F3 spike: Blob crosses on React 19 (`$B`), stream is consumed by serialization.
- **Tracked example + Chromium:** `examples/query-ssr-next` `/files`, driven by `verify-browser.mjs` step 10 (start + dev): server-read download, rejected files send no request (`FILE_TOO_LARGE`, `TYPE_NOT_ALLOWED`), accepted upload sent once, counted stream upload, download progress with a total, cancel never completes; it also caught and fixed a real hydration mismatch (`detectTransferSupport()` during SSR).
- **Types:** 62/62 packed type-consumer checks including file inputs, `onTransfer`, binary results and error narrowing through hooks.
- **Docs/rules:** `packages/react/README.md` ("Files through the hooks"), `docs/architecture.md`, `docs/public-api.md`, `examples/README.md`, `.cursor/rules/*.mdc` and regenerated `AGENTS.md`.
- **Gate:** `pnpm verify` exit 0 (125 files / 1336 tests, architecture, public API, 62/62 type consumers, unified consumer, Chromium 4 checks, Edge and workerd).

## Sign-off

- [ ] Owner sign-off
