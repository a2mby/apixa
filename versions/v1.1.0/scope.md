# v1.1.0 — Scope

Advanced File Handling, first release: file fields, automatic serialization, and minimal mock file
storage. Owner-approved expansion of the original Phase 1 contract (mock storage and `createMany`
moved in; automatic-on-binary replaced always-multipart).

## In scope

| Area             | Item                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declarations     | `fileFields: ["avatar"]` shorthand and `fileFields: { avatar: { name? } }` advanced form; names checked against the entity (compile time + construction time)                               |
| Types            | Reads keep `string` / `string[]`; eligible writes accept `File \| Blob` / `readonly (File \| Blob)[]`; optionality, `null`, and explicitly overridden operation body types preserved        |
| Format selection | JSON by default; **multipart automatically when the body contains binary values**; operation `dataFormat: "json" \| "multipart"` override; binary under forced JSON → `SerializationError`  |
| Serialization    | Bracket notation for nested objects; bracket default for ordinary arrays; repeated names for file lists; omit `undefined`; documented `null` handling; aliases; JSON-encoded fields; errors |
| Headers          | Remove incompatible `Content-Type` for multipart (including caller-built `FormData`) so the transport generates the boundary                                                                |
| Operations       | Eligible builtins `create`, `update`, `patch`, `upsert`, `createMany`; custom operations and `ctx.request()` get automatic multipart on binary bodies; bodyless operations unchanged        |
| Pipeline         | Binary-safe key transforms; middleware sees caller's values; cancellation, timeouts and retries preserved (body built once, replayed); caller bodies never mutated                          |
| Mock storage     | In-memory virtual file store in the shared mock engine: bytes separate from records, unique ids/refs, metadata, get/list/delete/reset, replace and cleanup, atomic with the dataset write   |
| React            | Existing `useResourceMutation` / hooks accept file-enabled inputs; inference verified; native `FileList` converted explicitly by consumers; no RHF dependency                               |
| Errors           | New `SerializationError`; config problems stay `ConfigError`; mock storage problems stay `MockError`; no binary data or request contents in messages                                        |
| Docs / tests     | `docs/architecture.md`, `docs/public-api.md`, `docs/story.md`, Core README; type, runtime, mock, React and packed-consumer tests; `examples/frontends/next` demonstration                   |

### Packages touched

| Package                 | Role                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `packages/core`         | Types, config validation, serializer, pipeline, mock file store, errors                    |
| `packages/mocking`      | Re-exports the public mock file API (`apixa/mocking`); `defineMockApi` itself is unchanged |
| `packages/react`        | Type verification and tests only                                                           |
| `apixa` facade (`src/`) | Re-exports only; public-export snapshot updated deliberately for the new names             |

## Release-blocker correction (added after the first real-world npm report)

| Area  | Item                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types | `useResource` / `useResourceQuery` / `useResourceMutation` never resolve to `any` when `@tanstack/react-query` is unresolvable: a named missing-peer error type instead (`peer.ts`)   |
| Tests | npm-installed type consumers from the packed tarball: core-only, React 18/19 with peers, React without TanStack; TS 5.5 / 5.9 / latest; bundler and nodenext; skipLibCheck on and off |
| Docs  | npm install requirements for React consumers and the `skipLibCheck` limitation                                                                                                        |

## Out of scope

| Item                                                                                   | Later phase |
| -------------------------------------------------------------------------------------- | ----------- |
| Downloads, binary responses, blob/stream response helpers                              | 3           |
| Progress APIs, streaming bodies, reliability tuning                                    | 4           |
| File limits (size / MIME / count), validation middleware, richer file error taxonomy   | 5           |
| Mock disks, fixtures, lifecycle policies, `defineMockApi` file fields                  | 6           |
| React/TanStack form helpers beyond type compatibility, browser/Node integration suites | 7           |
| Chunked, resumable and parallel uploads; storage-provider adapters                     | 8           |
| Cleanup policies, performance work, release hardening                                  | 9           |
| React Hook Form adapter (separate optional milestone after file handling)              | —           |

Also out: new packages or dependencies, Vue/Angular/OpenAPI, publishing, version bumps, tags,
declaring `v1.0.0` stable, edits to examples other than `examples/frontends/next`.
