# v1.1.0 — Implementation plan

Smallest path to native file fields, automatic serialization and minimal mock storage. Reshape
existing Core files; no new packages. All architecture decisions are final (owner, 2026-11-08).

## Final design

### Declarations and types

- `ResourceDefinition.fileFields?: readonly string[] | Record<string, FileFieldOptions>`;
  `FileFieldOptions = { name?: string }` (wire part name, used verbatim).
- File-field names must be string / `string[]` (optionally nullable) keys of the public entity.
- Eligible builtins (`create`, `update`, `patch`, `upsert`, `createMany`) replace file fields with
  `File | Blob` / `readonly (File | Blob)[]`. An operation with `dataFormat: "json"` keeps entity
  inputs. Metadata `body` overrides and custom operations are never rewritten. A stored `string`
  is not accepted as a file input; omit the key to keep the file.

### Format selection (per request, after key transforms)

1. Caller-built bodies (`FormData`, `Blob`, string, `URLSearchParams`, buffers, streams) pass
   through untouched; for `FormData` the runtime removes `Content-Type`.
2. Plain-object / array bodies: format = `dataFormat` if set, else multipart when the body contains a
   `Blob` anywhere, else JSON.
3. `dataFormat: "json"` with binary values throws `SerializationError`. `dataFormat: "multipart"`
   always encodes. `dataFormat` is write-only (compile-time and construction-time check).

### Multipart rules (documented in `docs/architecture.md`)

| Value                                                                   | Wire                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `string`                                                                | as is                                                                               |
| `number` / `boolean` / `bigint`                                         | `String(value)`                                                                     |
| `Date`                                                                  | ISO-8601                                                                            |
| `File` / `Blob`                                                         | file part (name, type kept; a bare `Blob` is named `blob`)                          |
| `undefined`                                                             | omitted                                                                             |
| `null`                                                                  | empty-string part (`multipart.nulls: "omit"` omits it)                              |
| nested object                                                           | `parent[child]` (recursive)                                                         |
| ordinary array                                                          | `key[]` per scalar (`multipart.arrays`: `"indices"` → `key[0]`, `"repeat"` → `key`) |
| array of objects                                                        | `key[0][field]`                                                                     |
| array of files                                                          | repeated `key` (or alias)                                                           |
| top-level array body (`createMany`)                                     | `items[0][field]`                                                                   |
| `multipart.jsonFields` entry                                            | one part holding `JSON.stringify(value)` (binary inside → error)                    |
| function, symbol, class instance, `FileList`, stream, cycle, depth > 32 | `SerializationError` naming the path only                                           |

Aliases come from `fileFields[name].name`; both aliases and `jsonFields` match the _public_ name and
are mapped through the request key transform when prepared.

### Request pipeline

Serialization runs where `serializeBody` runs today (inside `sendWithRetry`, once per logical call).
The built `FormData` is reused across retry attempts. Middleware, key transforms and mocks see the
caller's public body. The caller's object is never mutated. Mocked resources never serialize.

### Mock file store

`MockFileStorage` lives in the shared mock engine (`packages/core/src/mock/files.ts`), one per
built client, shared by its mocked resources.

- `put` copies bytes into private memory (no references to the caller's `Blob`), assigns a UUID id
  and a `mock-file://<id>/<name>` reference, records metadata (name, type, size, lastModified,
  createdAt, resource, field). No object URLs are ever created. Works in browsers and Node.
- API (`mockFiles(target)`, exported from Core and `apixa/mocking`): `get(ref|id)` (metadata +
  `blob()` / `bytes()` / `text()`), `has`, `meta`, `list(filter?)`, `delete`, `clear`, `size`.
- Mock writes on resources with `fileFields`: stage new files → run the store write → on success
  delete files no longer referenced (replacement, `update` dropping a field, `delete`,
  `deleteMany`); on any failure delete the staged files. Records hold string references, so
  reads, filters and `getAll` need no changes.
- A `Blob` in a field that is not a declared file field, or nested deeper than a field value,
  is a `MockError` (`MOCK_INVALID_INPUT`). `resetMock()` also clears the file store.
- Custom declarative `mock` handlers receive raw bodies and are out of scope for staging.

### Errors

`SerializationError` (code `SERIALIZATION`, never retried) for unencodable values / forced JSON with
binary. `ConfigError` for invalid `fileFields` / `dataFormat` / `multipart` configuration at
construction. `MockError` for storage problems. Messages carry field paths and types only.

## Ordered steps

1. **Reconcile contract and tests** — rewrite the four v1.1.0 files and update the type contract tests (this file, done first).
2. **Types** — `definition.ts` (`fileFields`, `dataFormat`, `multipart`), `inference.ts` (file inputs incl. `createMany`, validation).
3. **Errors** — `SerializationError`, code, guard-free export from Core.
4. **Config validation** — `api/validate.ts`: `fileFields` names/options, `dataFormat` on write ops, `multipart` options.
5. **Serializer** — `http/multipart.ts` (`containsBinary`, `serializeMultipart`) and `http/body.ts` (format selection, header rule).
6. **Operation integration** — `api/resource-client.ts`: resolve wire-mapped aliases / json fields / `dataFormat` into `PreparedOperation`; `ctx.request` `dataFormat`.
7. **Pipeline** — `request/pipeline.ts`: use the new encoder, reuse body across retries.
8. **Mock storage** — `mock/files.ts`, mock write staging in the pipeline's mock branch, `resetMock`, `mockFiles`.
9. **Exports** — Core + Mocking re-exports; `node scripts/verify-public-api.mjs --update`; review snapshot; `docs/public-api.md`.
10. **Tests** — type, serializer, pipeline (headers, retries, abort, transforms, middleware), mock storage, React inference, packed consumers.
11. **Docs and example** — architecture, README, `examples/frontends/next`, story, roadmap.
12. **Verify** — full gate (`pnpm verify`), `graphify update .`, tick acceptance criteria with evidence.

13. **Release-blocker correction** — (a) `packages/react/src/peer.ts`: `RequireTanStackQuery`, applied to every overload of the three hooks; (b) `scripts/verify-type-consumers.mjs` + `scripts/lib/type-consumer-fixtures.mjs` (npm, packed tarball, outside the workspace), added to `verify:consumers`; (c) README / `docs/public-api.md` / `docs/architecture.md` install requirements; (d) full gate.

## File touch list (expected)

- `packages/core/src/types/{definition,inference,errors,index}.ts`
- `packages/core/src/errors/{serialization-error,index}.ts`, `api/{validate,resource-client,client,reset}.ts`
- `packages/core/src/http/{body,multipart,index}.ts`, `request/pipeline.ts`, `mock/{files,store?,index}.ts`, `utils/uuid.ts`
- `packages/core/src/index.ts`, `packages/mocking/src/index.ts`
- `tests/core/*`, `tests/mocking/*`, `tests/react/*`, consumer scripts under `scripts/` if needed
- `docs/{architecture,public-api,story,roadmap}.md`, Core README, `examples/frontends/next`

## Explicit non-steps

- No new package, dependency, published entry point, or version bump.
- No React Hook Form dependency or adapter; no new hooks.
- No downloads, progress, streaming, chunking, parallel transfer, provider adapters, file limits.
- No Laravel/PHP conventions; no changes to unrelated APIs; no other examples; no commit, push or publish.
