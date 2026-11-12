# v1.2.0 — Scope

## In scope

| Area             | Item                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config           | `responseType` on declarative `OperationDefinition`; precedence per call > operation > default JSON; validated at `defineApi` (`ConfigError`) and per call                                                                                              |
| Types            | A literal `responseType` (operation or call) types the result: `text` → `string`, `blob` → `Blob`, `arrayBuffer` → `ArrayBuffer`, `stream` → `ReadableStream<Uint8Array> \| null`; `json`/absent unchanged                                              |
| Types            | Metadata `response` in `defineApi<T>()` still wins over the inferred binary type; `full: true` gives `ApiResponse<Binary>`; `ctx.request` infers from a literal `responseType` and keeps `request<T>()`                                                 |
| Types            | Same inference through direct calls, `useResourceQuery`, `useResource`, custom operations and published npm declarations                                                                                                                                |
| Body reading     | Non-2xx bodies are read as JSON/text by content type (never as the requested binary type); 204/205 yield an empty value of the requested type (`stream`: `null`)                                                                                        |
| Pipeline         | Binary data skips response key transforms (already true; now tested) and builtin JSON shaping (`toArray`, `slice`); response middleware receives it unchanged                                                                                           |
| Metadata         | Existing `ApiResponse` (`status`, `headers`, `raw`); new pure helper `parseContentDisposition` (RFC 6266 / 5987), never throws                                                                                                                          |
| Mock downloads   | Mock `mock` handlers receive a read-only `files` view of the client's existing virtual store; `MockStoredFile.file()`; binary results coerced to the requested `responseType` and given `Content-Type`, `Content-Length`, `Content-Disposition` headers |
| Errors           | `HttpError` for failed downloads; `ConfigError` for unsupported `responseType`; `MockError` (`MOCK_NOT_FOUND`, `MOCK_UNSUPPORTED` for mocked `stream`); aborts/timeouts during body read are `AbortError`/`TimeoutError`                                |
| Reliability      | Retries decide on status and headers only; a successful binary body is read once; cancellation and timeout cover the body read                                                                                                                          |
| Tests            | Characterization tests for today's `responseType` (none exist), type tests, runtime, mock, error/cancel, React, packed npm consumers, Chromium, Node, Vercel Edge, workerd                                                                              |
| Docs and example | `docs/architecture.md`, `docs/public-api.md`, README and Core README; `examples/frontends/next` download scenario; story and roadmap                                                                                                                    |

## Affected packages

| Package                      | Change                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (private)    | types, `transport/read-body.ts`, pipeline, `api/validate.ts`, `api/resource-client.ts`, mock handler and files, new `http/content-disposition.ts` |
| `packages/mocking` (private) | re-export of the new public type(s) only                                                                                                          |
| `packages/react` (private)   | **no source change expected**; type and runtime verification only. Any change needs a stated reason                                               |
| `apixa` facade (`src/`)      | explicit re-exports of the additions; `tests/facade/curated-root-exports.json` and the snapshot                                                   |
| `scripts/`                   | `verify-type-consumers.mjs`, `verify-unified-consumer.mjs`, `verify-edge.mjs`, fixtures                                                           |
| `examples/frontends/next`    | one download scenario; no other example touched                                                                                                   |

No new packages. No new runtime dependencies. No version bump.

## Public API compatibility

- No existing export, signature, default or error text changes for calls that do not use binary
  response types.
- Additions only: `OperationDefinition.responseType`, `parseContentDisposition` (+ its result type),
  the mock handler's `files` (`MockStoredFile.blob()` already returns a named `File`; no `file()` was added), and the typing of `responseType`. Every
  addition is recorded in `docs/public-api.md` and applied with
  `node scripts/verify-public-api.mjs --update`.
- **One behavior change, scoped to explicit non-JSON modes:** a 204/205 with `responseType`
  `text`/`blob`/`arrayBuffer` returns `""` / empty `Blob` / empty `ArrayBuffer` instead of `null`,
  so the type is truthful. Default (JSON) 204 stays `null`. Non-2xx binary-mode errors now carry a
  parsed JSON/text `HttpError.data` instead of a `Blob`. Both are documented and tested.
- `Transport` and `TransportRequest` are unchanged: `responseType` stays a hint for **successful**
  bodies; custom transports may keep ignoring it as today.

## Boundaries with other file phases

| Phase                                            | Boundary                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| v1.1.0 uploads (phase 1)                         | Reused, not reopened: `fileFields`, multipart, the virtual store                    |
| 4. Progress, streaming, reliability              | `stream` is only typed and passed through; no progress, no chunk APIs, no Range     |
| 5. Validation, file limits                       | No size limits or content validation here                                           |
| 6. Advanced mock disks                           | Only read access from handlers to the existing store; no disks, fixtures, lifecycle |
| 7. Form compatibility / browser integration      | No React Hook Form adapter, no automatic download trigger, no `<a download>` helper |
| 8. Large files, storage adapters, presigned URLs | Out                                                                                 |

## Out of scope

| Item                                                        | Why                                       |
| ----------------------------------------------------------- | ----------------------------------------- |
| Upload or download progress; streaming progress APIs        | Phase 4                                   |
| Resumable, ranged, chunked or parallel transfers            | Phases 4 and 8                            |
| Presigned URL workflows; S3 or cloud storage adapters       | Phase 8                                   |
| Advanced mock disks, fixtures, lifecycle                    | Phase 6                                   |
| React Hook Form adapter                                     | Separate optional milestone               |
| Browser download triggers, save dialogs, object URLs, UI    | Application concern                       |
| Writing mocked `stream` responses, `Blob` SSR serialization | Phase 4 / framework boundary (documented) |
| New packages, new transport interface, resource redesigns   | Not needed (audit)                        |
| Release, publish, version bump                              | Separate owner decision                   |
