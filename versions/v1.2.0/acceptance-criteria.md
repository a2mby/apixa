# v1.2.0 — Acceptance criteria

Check an item only with evidence (test name, command output, browser run).

## API and types

- [x] `responseType` is accepted on declarative operations and per call; precedence call > operation > JSON default; an invalid value is a `ConfigError` (at `defineApi` and per call). _Evidence: `tests/core/response-types.test.ts` (operation-level, builtin override, precedence, ConfigError at config and per call, no transport call)._
- [x] A literal `responseType` infers `string` / `Blob` / `ArrayBuffer` / `ReadableStream<Uint8Array> | null`; none of them is `any` or `unknown` (`NotAny` on whole results). _Evidence: `tests/core/download-types.test.ts` (`toEqualTypeOf` for string/Blob/ArrayBuffer/stream, `IsAny` false); npm fixtures `_d1`–`_d12`._
- [x] Metadata `response` in `defineApi<T>()` still wins; `full: true` gives `ApiResponse<Binary>`; widened `ResponseType` and absent options keep today's types. _Evidence: `download-types.test.ts` (metadata wins; widened union gives `Doc | Blob`; full gives `ApiResponse<Blob>`; plain clients unchanged)._
- [x] `ctx.request({ responseType: "blob" })` infers `Blob`; `ctx.request<User>(...)` is unchanged. _Evidence: `download-types.test.ts` (`ctx.request` overloads, `request<Doc>` and `request<Doc[]>` unchanged); npm fixtures `viaCtx`/`typedCtx`._
- [x] Compile-time tests cover builtins with per-call `responseType`, declarative downloads, function operations, `useResourceQuery` and `useResource` (whole result and `data`/`select`). _Evidence: `download-types.test.ts`, `tests/react/download.test.tsx` (`useResourceQuery`, `useResource`, `useResourceMutation`, whole result NotAny), `verify-type-consumers.mjs` hook fixtures._
- [x] No existing export, signature, default or error text changed for non-binary calls; additions only, recorded in `docs/public-api.md`; `pnpm check:api` passes after a reviewed `--update`. _Evidence: `pnpm check:api` verified after reviewed `--update`: additions only (`parseContentDisposition`, `ContentDisposition`, `MockFilesHandle`); `docs/public-api.md` v1.2.0 section._

## Runtime and binary correctness

- [x] Characterization tests for the pre-existing `responseType` behavior exist and pass on the unchanged code (batch 0). _Evidence: first describe in `response-types.test.ts` was written and passed (9/9) before any source change (batch 0)._
- [x] `blob`, `arrayBuffer`, `text` and `stream` bodies are returned byte-exact (non-UTF-8 bytes, empty body, large body) and never JSON-parsed or stringified. _Evidence: `response-types.test.ts` (non-UTF-8 bytes `[0,255,128,10,13,0xc3,0x28]`, byte-exact, text not JSON-parsed); browser and edge runs byte-exact. Large and empty-body cases: empty covered by 204 tests; no dedicated large-body test (not claimed)._
- [x] Response key transforms do not touch binary data; builtin `getAll` shaping (`toArray`, `slice`) is skipped for binary; `exists` is unaffected; response middleware receives the unchanged value. _Evidence: `response-types.test.ts` (keys with Blob/ArrayBuffer; `getAll` + `slice` stays a Blob; middleware receives the same Blob). `exists` is covered by the existing suite (unchanged, `allow404` shaping kept)._
- [x] A 204/205 returns `""` / empty `Blob` / empty `ArrayBuffer` for explicit text/binary modes, `null` for `stream` and for default JSON; documented as the only behavior change. _Evidence: `response-types.test.ts` empty-bodies tests for 204 and 205 (text/blob/arrayBuffer empty, stream and default JSON null)._
- [x] Default JSON behavior is byte-for-byte unchanged (existing 925+ tests pass without edits to their expectations). _Evidence: full suite: 979 tests pass; no existing test expectation was edited._

## Metadata

- [x] `{ full: true }` exposes status, headers, content type and (when sent) length for binary results. _Evidence: `response-types.test.ts` full-response test; `mock-downloads.test.ts`; unified consumer and browser run._
- [x] `parseContentDisposition` handles `attachment`/`inline`, quoted and unquoted `filename`, `filename*` (UTF-8, percent-encoded, preferred), path stripping, absent header, and malformed input; it never throws; no filename or length is ever assumed. _Evidence: `tests/core/content-disposition.test.ts` (6 tests: attachment/inline, quoted/unquoted, `filename*` UTF-8 and ISO-8859-1, precedence, fallbacks, path stripping, malformed, absent, Headers input)._

## Mock storage integration

- [x] A declarative operation with a `mock` handler downloads the bytes of a file uploaded in the same client; content, type, name and length match; `Content-Type`/`Content-Length`/`Content-Disposition` are present on the mock response. _Evidence: `tests/core/mock-downloads.test.ts` (round trip, name/type/size, Content-Type/Length/Disposition incl. non-ASCII filename); browser run._
- [x] A mocked result is coerced to the requested `responseType` so mocked and live resources return the same type. _Evidence: `mock-downloads.test.ts` (arrayBuffer/text per operation and per call, JSON serialized as a server would)._
- [x] Clients are isolated; `resetMock` and `delete`/`deleteMany` cleanup make a later download fail with `MOCK_NOT_FOUND`; a missing reference is `MOCK_NOT_FOUND`; mocked `stream` is `MOCK_UNSUPPORTED`. _Evidence: `mock-downloads.test.ts` (isolation, record delete, `resetMock`, missing file `MOCK_NOT_FOUND`, `has()` probe, mocked stream `MOCK_UNSUPPORTED`); browser: download after `resetMock` is `MOCK_NOT_FOUND`._
- [x] No transport call, no real network request and no object URL for any mocked download; no second mock file system was added. _Evidence: `mock-downloads.test.ts` (throwing transport, `createObjectURL` spy = 0); browser run: no request to `api.example.com`; no second store: the handler view wraps `MockFileStorage`._

## Errors, cancellation and reliability

- [x] A non-2xx binary-mode response is an `HttpError` whose `data` is the parsed JSON/text body, not a `Blob`. _Evidence: `response-types.test.ts` failed-downloads (JSON, text, stream); `download-reliability.test.ts` exhausted retries; unified consumer._
- [x] Abort and timeout during the body read are `AbortError` / `TimeoutError`; a mid-stream read failure is a `NetworkError`. _Evidence: `tests/core/download-reliability.test.ts` (abort and call/operation timeout during body read, mid-stream failure `NetworkError`, already-aborted never starts); required no source change._
- [x] Retries still decide from status and headers; a successful binary body is read once; non-replayable request bodies are still not retried. _Evidence: `download-reliability.test.ts` (retry after mid-body failure returns full bytes once; retry from status with JSON error body; successful body read exactly once; write not retried; non-replayable stream body not retried)._

## React and published package

- [x] `useResourceQuery` and `useResource` return typed `Blob` data from a download operation, work with `select` and mutation-kind downloads, and need no React source change (or each change is justified in the story). _Evidence: `tests/react/download.test.tsx` (jsdom): query, select, `useResource`, mutation-kind download; no React source change. Note: hooks unwrap (`full` unavailable by design); documented._
- [x] npm packed consumers (outside the workspace) type the download results without `any`: core-only and React 18/19, TypeScript 5.5/5.9/latest, bundler and nodenext, `skipLibCheck` on and off; the runtime round trip passes from the tarball. _Evidence: `node scripts/verify-type-consumers.mjs`: 62/62 (core-only, React 18/19 with peers, missing TanStack still detected; TS 5.5.4/5.9.3/latest; bundler/nodenext; skipLibCheck on/off) with the new download fixtures; unified consumer runtime round trip from the tarball._
- [x] Core stays free of `node:*`, DOM-only APIs and `Buffer`; `pnpm check:architecture` passes. _Evidence: `pnpm check:architecture`: 127 modules, no forbidden imports._

## Cross-runtime

- [x] Node (unit and packed), Chromium against `examples/next` (a real download scenario, mock and fake-transport), React 18 and 19, Next.js SSR, Vercel Edge Runtime and workerd all pass; `pnpm verify:browser` and `pnpm verify:edge` cover the new behavior. _Evidence: Node: vitest + unified consumer; Chromium: `/test/files` driven with playwright (mock download, live `Response.blob`, reset), `verify:browser` ok; React 18/19 consumers; Next start and dev: `/download` Server Component asserts (unified consumer); Vercel Edge and workerd: `verify-edge.mjs` download assertions pass._

## Constraints, docs and example

- [x] One published package `apixa`; no new workspace package or runtime dependency; no version bump; nothing committed, pushed or published by this milestone's implementation run. _Evidence: no new package or dependency; no version bump; nothing committed or pushed._
- [x] `docs/architecture.md`, `docs/public-api.md`, README and Core README describe downloads, the typing rules, the 204 and error-body behavior, the mock download path, and the Blob/SSR limitation; later phases stay marked planned. _Evidence: architecture section, public-api v1.2.0 section, README paragraph, Core README section (typing rules, 204, error bodies, mock path, Blob/SSR and hooks-unwrap notes)._
- [x] `examples/next` shows a download workflow; no other example touched. _Evidence: `/test/files` Download and Live download buttons (`examples/next` only; gitignored here)._
- [x] `docs/story.md` and `docs/roadmap.md` updated honestly; `graphify update .` run. _Evidence: story entry added; roadmap updated; `graphify update .` run._

## Verification

- [x] `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck && pnpm test` pass. _Evidence: within full `pnpm verify` (87 files, 979 tests)._
- [x] `pnpm verify:consumers && pnpm verify:browser && pnpm verify:edge` pass. _Evidence: within full `pnpm verify`._
- [x] Full `pnpm verify` exits 0. _Evidence: `/tmp/verify5.log`: build, architecture, API, typecheck, 979 tests, consumers, browser (3 checks), edge all passed; no ELIFECYCLE._

## Sign-off

- [ ] Remaining unchecked items listed in the final report; owner confirms before release (release and version bump are separate).
