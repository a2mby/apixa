# v1.2.0 — Implementation plan

Ordered smallest path. Reshape existing Core files before adding any; the only new source file is
`http/content-disposition.ts`.

## Prerequisite

v1.1.0 (file uploads, the virtual file store, the React peer guard) must be landed on `main`
before batch 4, because the mock download reads that store. Batches 0–3 do not depend on it.

## Design decisions to lock

1. **Where configuration lives.** `responseType` on `OperationDefinition` (declarative operations).
   Function operations (`{ kind, run }`) choose per `ctx.request({ responseType })`. Precedence:
   call option > operation > default JSON. No resource-level default (a resource mixes JSON and
   binary operations).
2. **Type derivation.** One mapped helper, `ResponseTypeData<RT>`: `text` → `string`, `blob` →
   `Blob`, `arrayBuffer` → `ArrayBuffer`, `stream` → `ReadableStream<Uint8Array> | null`,
   `json`/undefined → "not binary" (the existing derivation is used unchanged).
   - Declarative operation: `response` from `defineApi<T>()` metadata wins; otherwise a literal
     runtime `responseType` supplies the type; otherwise today's inference.
   - Per call: `CallResult<Data, O>` gains a branch for `O extends { responseType: infer RT }`
     with a non-JSON literal (the caller explicitly asked for raw data, so it replaces `Data`);
     `full: true` wraps it in `ApiResponse`. A widened `ResponseType` (non-literal) stays `Data`.
   - `ctx.request`: add overloads for a literal non-JSON `responseType` (with and without
     `full`) ahead of the existing generic one, so `request<User>(...)` is unaffected.
   - Validated by compile-time tests (`tests/core/download-types.test.ts`) and, for npm
     declarations, the type-consumer fixtures.
3. **Reading the body.** `readBody(response, responseType)` becomes status-aware: for `!response.ok`
   it always uses the default JSON/text logic (keeps `HttpError.data` useful, drains streams).
   204/205 → `""` / `new Blob([])` / `new ArrayBuffer(0)`; `stream` → `null`; default JSON stays
   `null`. `Transport` / `TransportRequest` stay as they are.
4. **Validation.** `responseType` ∈ the five values: `ConfigError` at `defineApi` time for
   operations, and a `ConfigError` rejection for an invalid per-call value (today it is silently
   JSON).
5. **Binary data in the pipeline.** Key transforms already skip non-plain values; add an explicit
   guard and test. When the effective `responseType` is not JSON, builtin shaping (`fromHttp`
   `toArray`, `slice`) is skipped so a `Blob` is never wrapped or sliced; status-only `exists`
   is unaffected. Response middleware gets `ApiResponse<Blob>` unchanged.
6. **Metadata.** `parseContentDisposition(source: Headers | string | null | undefined)` →
   `{ type: string; filename?: string }`: RFC 6266, `filename*=` (RFC 5987, percent-decoded
   UTF-8) preferred over `filename=`, quoted-string unescaping, path segments stripped, and any
   malformed value returns `{ type: "" }`-style empties instead of throwing. Content type and
   length use `headers.get()`. A non-numeric `Content-Length` is simply ignored by callers; no
   Apixa API parses it.
7. **Mock downloads.** Use the existing virtual store only.
   - The `mock` handler context gains `files`: a read-only view bound to the client's
     `MockFileStorage` (`has(ref)`, `meta(ref)`, `get(ref)`, `list(filter?)`). `get`/`meta` throw
     `MockError("MOCK_NOT_FOUND")` for an unknown or deleted reference; `has` probes.
   - `MockStoredFile` gains `file()` (a fresh `File` with the stored name and type).
   - A handler result that is a `Blob`/`File`/`ArrayBuffer`/`Uint8Array`/string is coerced to the
     effective `responseType` (`blob`, `arrayBuffer`, `text`; JSON data passes untouched) and the
     mock response `Headers` get `Content-Type`, `Content-Length` and, for a `File`,
     `Content-Disposition: attachment; filename*=UTF-8''…`. Mocked `responseType: "stream"` →
     `MockError("MOCK_UNSUPPORTED")`.
   - Function operations (`ctx.request`) on a mocked resource keep today's behavior (CRUD routes
     only, otherwise `MOCK_UNSUPPORTED`); the documented mock download path is a declarative
     operation with a `mock` handler. Isolation, reset and deletion come from the store.
8. **Errors and cancellation.** No new error classes. A body read that is aborted or times out
   must be `AbortError` / `TimeoutError` (today the read sits outside `fetch`'s own `try`; verify
   and fix in `fetch.ts` / `classify`). A body read that fails mid-stream is a `NetworkError`.
   Retries are decided from status and headers before any binary body is read.
9. **React.** No hook changes. Blob results live in the TanStack cache like any value (not
   serializable: dehydration/SSR boundaries are documented as such).

## Ordered batches

0. **Baseline.** Characterization tests of today's behavior with a fake `Transport` and a real
   `Response` through `createFetchTransport`: each `responseType`, default JSON fallbacks, 204,
   `full`, key transforms leaving `Blob`/`ArrayBuffer` alone, `ctx.request` forwarding. They pass
   on the unchanged code (no source edits).
1. **Types.** `definition.ts` (`responseType`), `inference.ts` (`ResponseTypeData`, `CallResult`,
   declarative-operation response), `builtins.ts` (`ctx.request` overloads); type tests including
   metadata override, `full`, hooks.
2. **Runtime.** `api/validate.ts`, `api/resource-client.ts` (operation-level `responseType` into
   the prepared operation, call precedence), `transport/read-body.ts` (status-aware, 204),
   `request/pipeline.ts` (skip JSON shaping for binary); runtime tests.
3. **Metadata.** `http/content-disposition.ts`, exports through Core, facade and the curated list,
   `--update` of the snapshot; unit tests (quoted, `filename*`, unicode, malformed, absent).
4. **Mock downloads.** `mock/files.ts` (`file()`, read-only view), `mock/handler.ts` (`files` in
   the context), mock branch of the pipeline (coercion, synthesized headers, `stream` rejection),
   `types/mock-handler.ts` typing; tests for round trip, metadata, isolation, reset, delete,
   missing file, no network call.
5. **Errors and cancellation.** HTTP errors with binary types, invalid types, abort and timeout
   during the body read, mid-stream failure, retry safety (replayed requests, single read).
6. **React.** `useResourceQuery` and `useResource` with a download operation (Blob data,
   `select`, `full`), mutation-kind download through `useResource`; type assertions on whole
   results, no `any`.
7. **Packed consumers and runtimes.** Extend `verify-type-consumers.mjs` fixtures (core-only and
   React, typed `Blob`) and `verify-unified-consumer.mjs` (runtime); edge scripts for Vercel Edge
   and workerd with a faked `Response`; `examples/next` download scenario driven in Chromium;
   Next SSR check.
8. **Docs and close.** `docs/architecture.md`, `docs/public-api.md`, README, Core README,
   `docs/story.md`, `docs/roadmap.md`; `pnpm verify`; `graphify update .`; tick acceptance
   criteria with evidence.

## Implementation notes (recorded during the run)

- `MockStoredFile.file()` was **not added**: `MockStoredFile.blob()` already returns a named `File`
  when `File` exists, which is exactly what the plan needed. Scope listed it as an addition; the
  public-API additions are therefore only `parseContentDisposition`, `ContentDisposition` and
  `MockFilesHandle`.
- The typed `mock` handler result stays metadata-driven (`response` in `defineApi<T>()`, else
  `unknown`); the runtime `responseType` literal types the **call result**, and the mock coerces
  whatever the handler returns.
- The hook facade resolves unwrapped payloads by design (`full` is `false` in hook option types);
  metadata is read through the direct client. Documented, not changed.
- Mocked JSON results under a binary `responseType` are serialized like a server would (rather than
  rejected), so mocked and live resources agree.
- Abort/timeout/mid-body-failure behavior needed no source change; the tests are the evidence.

## Details the implementing agent settles (no owner decision needed)

- Exact names of the new type helper and result type (`ContentDisposition`).
- Whether `files` is a small interface or a narrowed `MockFileStorage` type, as long as it is
  read-only and exported from the same entry points as `MockStoredFile`.
- Whether builtin shaping is skipped via the effective `responseType` or a flag on the prepared
  operation.
- How the status-aware read keeps `stream` bodies from leaking on non-2xx (cancel or drain).

If any of these turn out to need a public-API change beyond the additions listed in `scope.md`,
stop and report instead of widening scope.

## File touch list (expected)

- `packages/core/src/types/{definition,inference,builtins,transport,mock-handler,index}.ts`
- `packages/core/src/transport/{read-body,fetch}.ts`, `request/pipeline.ts`,
  `api/{validate,resource-client}.ts`, `http/{content-disposition,index}.ts`,
  `mock/{files,handler,index}.ts`, `index.ts`
- `packages/mocking/src/index.ts`, `src/index.ts`, `tests/facade/*`
- `tests/core/*`, `tests/mocking/*` (if needed), `tests/react/*`
- `scripts/{verify-type-consumers,verify-unified-consumer,verify-edge}.mjs`, `scripts/lib/*`
- `docs/{architecture,public-api,roadmap,story,context}.md`, README, Core README, `examples/next`

## Explicit non-steps

- No `defineDownloadApi`, download client, new transport interface or second mock file system.
- No progress, resumable, ranged, chunked or parallel transfer; no presigned URLs or adapters.
- No automatic browser download, object URLs, `<a download>` helpers or UI.
- No React hook API changes, no React Hook Form adapter.
- No key-transform changes, no resource-level `responseType` default.
- No new package, dependency, version bump, commit, push or publish.
