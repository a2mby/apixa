# v1.1.0 — Acceptance criteria

Check an item only with evidence (test, typecheck, script). Evidence is noted inline.

## Declarations and types

- [x] `fileFields: ["avatar"]` and `fileFields: { avatar: { name } }` compile and behave identically. _Evidence: `tests/core/file-fields-types.test.ts` (simple + advanced types), `file-requests.test.ts` (alias behavior)._
- [x] A `fileFields` name that is not a string / `string[]` entity key is a compile error; malformed declarations are a construction-time `ConfigError` (entity names cannot be checked at runtime). _Evidence: compile-time: `@ts-expect-error` cases in `file-fields-types.test.ts`. Runtime checks shape only (names cannot be compared with the entity at construction): `ConfigError` for non-array/object, empty, duplicate, unsafe, non-string names (`file-requests.test.ts`)._
- [x] Read operations keep `string` / `string[]` for file fields. _Evidence: `file-fields-types.test.ts`._
- [x] `create`, `update`, `patch`, `upsert`, `createMany` accept `File | Blob` / `readonly (File | Blob)[]` for file fields; optionality and `null` are preserved. _Evidence: `file-fields-types.test.ts` (incl. `createMany`, nullable, optional)._
- [x] Explicit metadata `body` overrides and custom operations are not rewritten; `dataFormat: "json"` reverts file inputs to entity types. _Evidence: `file-fields-types.test.ts` ("keeps explicitly declared operation body types", "reverts … dataFormat json")._
- [x] Resources without `fileFields` have unchanged operation types. _Evidence: `Parameters<create>[0]` equals `CreateBodyOf<User>` in `file-fields-types.test.ts`; 841 pre-existing tests still pass._

## Format selection and serialization

- [x] A body with no binary values is sent as JSON exactly as before (regression tests). _Evidence: `file-requests.test.ts` ("keeps JSON…"), `multipart-serialization.test.ts`._
- [x] A body containing a `File` / `Blob` is sent as `FormData` automatically, on builtins, custom operations and `ctx.request()`. _Evidence: `file-requests.test.ts`: builtins, custom declarative op, `ctx.request()`._
- [x] `dataFormat: "multipart"` forces multipart; `dataFormat: "json"` with binary values throws `SerializationError`; `dataFormat` on a read operation is a compile and construction error. _Evidence: `file-requests.test.ts`, `multipart-serialization.test.ts`; read-op `dataFormat` rejected by `@ts-expect-error` and `ConfigError`._
- [x] Nested objects use `a[b][c]`; scalar arrays use `key[]`; object arrays use `key[0][f]`; file lists repeat the field name; `multipart.arrays` switches notation. _Evidence: `multipart-serialization.test.ts`._
- [x] `undefined` omitted; `null` follows `multipart.nulls`; `Date`, number, boolean, bigint encoded as documented. _Evidence: `multipart-serialization.test.ts`._
- [x] Field aliases (`fileFields[name].name`) and `multipart.jsonFields` work, including under `snake_case` request transforms. _Evidence: `file-requests.test.ts` (alias, jsonFields, snake_case)._
- [x] File name, type and bytes are preserved in the produced parts. _Evidence: `multipart-serialization.test.ts`, `file-requests.test.ts`._
- [x] Unsupported values (function, symbol, class instance, `FileList`, cycle, depth) throw `SerializationError` with path only; no binary data or values in messages. _Evidence: `multipart-serialization.test.ts`, `file-requests.test.ts` (no secret name/bytes in error text)._
- [x] Any `Content-Type` is removed for multipart (including a caller-built `FormData`); a real `fetch` `Request` shows `multipart/form-data; boundary=…`. _Evidence: `multipart-serialization.test.ts` (real `Request` shows boundary), `file-requests.test.ts`._

## Pipeline

- [x] Request key transforms leave `File` / `Blob` instances identical; part names follow the transform. _Evidence: `file-requests.test.ts` (snake_case)._
- [x] Middleware sees the caller's `File` instances; the caller's body object is not mutated. _Evidence: `file-requests.test.ts` (instance identity + no mutation)._
- [x] Cancellation and timeout abort a multipart request with the existing errors. _Evidence: `file-requests.test.ts`._
- [x] A retried multipart request resends an equivalent body; stream bodies are never retried. _Evidence: `file-requests.test.ts` (same body across 3 attempts; stream not retried)._
- [x] Bodyless operations are unchanged; disabled operations stay absent; custom overrides still win. _Evidence: `file-requests.test.ts` (getAll/delete); disabled-operation config accepted; custom-wins covered by existing `operations-customization` tests._

## Mock file storage

- [x] Mock `create` / `update` / `patch` / `upsert` / `createMany` with files store bytes in the file store and string refs in records; reads return strings. _Evidence: `mock-files.test.ts`._
- [x] Multiple files, replacement (old file removed), field removal on `update`, `delete` and `deleteMany` clean up storage. _Evidence: `mock-files.test.ts`._
- [x] A failing mock write (duplicate id, not found, invalid input) leaves records and storage unchanged. _Evidence: `mock-files.test.ts` (duplicate id, not found, createMany batch)._
- [x] `mockFiles(api)` retrieves bytes, metadata and lists; `delete`, `clear`; `resetMock` clears files and records. _Evidence: `mock-files.test.ts`._
- [x] No `URL.createObjectURL` is called; retrieval returns fresh `Blob`s; no references to caller blobs are kept. _Evidence: `mock-files.test.ts` (spy; fresh copies; no caller reference)._
- [x] A `Blob` in an undeclared or nested field is a `MockError` (`MOCK_INVALID_INPUT`). _Evidence: `mock-files.test.ts`._

## React and compatibility

- [x] `useResourceMutation` accepts file-enabled inputs and infers them (type test + runtime test); `FileList` conversion documented. _Evidence: `tests/react/file-mutation.test.tsx` (types + runtime, `useResource` facade, FileList conversion)._
- [x] No React Hook Form dependency anywhere; no RHF adapter. _Evidence: no RHF import in `packages/*`; `check:architecture` passes (the gitignored `examples/frontends/next` already listed `react-hook-form` before this milestone)._
- [x] Existing public exports unchanged apart from the documented additions; error text and hook signatures unchanged. _Evidence: `pnpm check:api`; snapshot diff is additions only (plus prettier reformatting)._

## Constraints and docs

- [x] One published package (`apixa`); no new workspace packages or dependencies; `pnpm check:architecture` passes. _Evidence: `pnpm check:architecture`; single tarball in consumer/edge checks._
- [x] `docs/architecture.md`, `docs/public-api.md`, Core README describe file fields, rules, mock storage; later phases marked planned. _Evidence: `docs/architecture.md` ("File handling"), `docs/public-api.md`, `packages/core/README.md`._
- [x] `examples/frontends/next` shows an implemented file workflow; no other example touched. _Evidence: `/test/files` (`app/test/files/page.tsx`, `lib/file-upload-demo.ts`) driven in real Chromium against `next dev` (playwright-core): a real `<input type="file">` selection (`rex.txt`) was submitted through `useResource(...).create({ name, photo })`; the entity came back with `photo: "mock-file://<uuid>/rex.txt"`; `mockFiles(api).get(ref)` returned name `rex.txt`, type `text/plain`, size 9, text `rex-bytes`; `fetch(ref)` rejected ("URL scheme mock-file is not supported") and `<img src=ref>` failed to load, so the reference is an internal id, not a browser URL; no request left the page for the mocked resource; `resetMock(api)` left `mockFiles(api).size === 0`. No React Hook Form or adapter involved (the `FileList` is converted with `Array.from`). Only `examples/frontends/next` touched (gitignored here). The only console 404 was the missing favicon._
- [x] `docs/story.md` and `docs/roadmap.md` updated honestly. _Evidence: story entry and roadmap updated._

## Verification

- [x] `pnpm build && pnpm check:architecture && pnpm check:api && pnpm typecheck && pnpm test` pass. _Evidence: full `pnpm verify` run: 925 tests, check:api, check:architecture, typecheck._
- [x] `pnpm verify:consumers && pnpm verify:browser && pnpm verify:edge` pass. _Evidence: `pnpm verify` exit 0: packed consumers (React 18/19), Chromium (Next start + dev), Vercel Edge Runtime and workerd._
- [x] `graphify update .` run. _Evidence: run after the code changes._

## Release blocker: missing TanStack peer (found in a real npm consumer of 1.0.0-rc.0)

Cause: `@tanstack/react-query` is an optional peer, so npm does not install it. Unresolved imports in `apixa`'s declarations are error types that act as `any`, and `any & UseQueryResult<…>` is `any`; `useResource` / `useResourceQuery` results collapsed to `any`, while `useResourceMutation` (own mutation types) kept its types. pnpm workspaces always had the package, so no check caught it.

- [x] Hook results are never `any` without TanStack: all three return `ApixaMissingPeer_Install_tanstack_react_query`, so the first property read is a compile error naming the fix. _Evidence: `peer.ts`; `verify-type-consumers.mjs` "missing tanstack … fails and names the fix" for React 18/19 × TS 5.5.4/5.9.3/latest × bundler/nodenext × skipLibCheck on/off._
- [x] With peers installed, whole-result and per-member `any` detection, exact `User[] | undefined`, `select()` inference, operation argument and custom-operation inference pass for all three hooks. _Evidence: same script, "with peers" rows (same matrix)._
- [x] Core-only npm project (no React, no TanStack installed) compiles cleanly with skipLibCheck on and off. _Evidence: "core-only" rows._
- [x] Regression has teeth: with the guard disabled, exactly the 20 missing-peer checks fail. _Evidence: mutation run (guard replaced by identity), restored afterwards._
- [x] Install requirements documented with the npm command; limitation stated. _Evidence: README, `docs/public-api.md`, `docs/architecture.md`._
- Limitation (not a defect): under `skipLibCheck: true` TypeScript hides the unresolved-module error inside `node_modules`, so the compile-time signal is the guard type on first use, not TS2307. Code that never reads a hook result is not flagged. `ApixaProvider` / `QueryClient` / hydration components are unguarded (they need the package at runtime).

## Sign-off

- [ ] Remaining unchecked items listed in the final report; owner confirms before release (release and version bump are separate).
