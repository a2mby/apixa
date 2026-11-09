# v1.4.0 — Scope

## In scope

| Area               | Item                                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size               | Per-file `maxSize` (and `minSize`, so zero-byte files can be refused) per file field; request-level `maxTotalSize`; sizes from `Blob.size` only (never trusted from names or headers)                                                                           |
| Count              | Per-field `min` / `max` (single and multiple file fields); request-level `maxFiles`; works with arrays, nested objects and caller-built `FormData`                                                                                                              |
| MIME               | `accept` patterns (`"image/*"`, `"application/pdf"`, `".png"`, like an `<input accept>`), `reject`, case-insensitive; `unknownType` policy for an empty `File.type`; documented as caller-declared, never proof                                                 |
| Extension          | Allowed / rejected extensions, case-normalized (last segment); files with no extension handled by policy; opt-in suspicious-filename check (path separators, control chars, NUL, overlong, double-extension flag)                                               |
| Configuration      | Rules live in the existing `fileFields` field options; operation-level `fileFields` overrides (per field, shallow merge over the resource); request-level limits; one documented precedence; invalid rules are `ConfigError` at `defineApi`                     |
| Request validation | One validation step before serialization / transport / mock execution for builtin operations, custom declarative operations, function operations and `ctx.request()`; bodies that are not files (JSON, strings, raw `Blob`/buffers, streams) handled explicitly |
| Streams            | Caller `ReadableStream` bodies: byte limit enforced by a pull-based counting wrapper (no buffering, no content inspection); unknown size reported as unknown; abort with `ValidationError` when exceeded                                                        |
| Response safety    | `maxResponseSize` (and optional response `accept` on `Content-Type`) per operation / call: early rejection from a trustworthy `Content-Length`, authoritative counted enforcement for blob / arrayBuffer / text / json / stream, no buffering of a stream       |
| Middleware         | No new hooks: validation runs after request middleware (and sees what it added); `ValidationError` flows through existing error middleware and `replay()`                                                                                                       |
| Errors             | `ValidationError` reused (`VALIDATION`, non-retryable) with typed `violations` (`code`, `path`, limits, counts); no contents, no filenames by default; one stable code set                                                                                      |
| Mocks              | Same validator before mock execution for live and mocked calls; rejected writes leave `mockFiles()` untouched; mock download limits against the real byte size                                                                                                  |
| Transfer + retries | A pre-send violation calls no transport, emits no `onTransfer` event, is never retried; a mid-transfer limit ends the transfer as an `error` event (`willRetry: false`); limits reuse the v1.3.0 counting stream                                                |
| Types              | Rule types additive on `FileFieldOptions`; `fileFields` typing and entity checks unchanged; `ValidationError.violations` typed; inference through builtins, custom ops, `ctx.request()`, hooks and packed declarations                                          |
| Tests              | Characterization first; pure validator, config, pipeline, streams, response limits, mocks, retries, transfer events, types, React 18/19, packed consumers, Chromium, Node, Next SSR, Vercel Edge, workerd                                                       |
| Docs and example   | `docs/architecture.md`, `docs/public-api.md`, READMEs; a "client validation is not security" section; one `examples/next` scenario; story and roadmap                                                                                                           |

## Out of scope

| Item                                                                                | Why                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Content sniffing, magic bytes, antivirus, malware or polyglot detection             | Not provable client-side; would imply false safety |
| Image dimensions, media duration, PDF inspection                                    | Content parsing; later or user-land                |
| Zod / schema-library integration, mandatory schema dependency                       | Constraint; optional schema hooks are roadmap      |
| Advanced mock storage (disks, fixtures, lifecycle)                                  | Roadmap phase 6                                    |
| Chunked / resumable / parallel uploads, checkpoints, presigned URLs, cloud adapters | Roadmap phase 8                                    |
| React Hook Form and framework form adapters; validation UI                          | Separate optional milestone                        |
| A new validation client, package, or file-middleware pipeline / duplicate hooks     | Violates one-pipeline rule                         |
| Default (on-by-default) limits, or changing any default file / transfer behavior    | Opt-in only; compatibility                         |
| New retry policy, rate limiting, quota tracking                                     | Unrelated                                          |
| Vue, Angular, new framework packages                                                | Not in any current scope                           |

## Affected packages

| Package                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (private)    | `types/definition.ts` (rules on `FileFieldOptions`, operation `fileFields`, `maxResponseSize`), `types/transport.ts` (call-level override if locked), `api/validate.ts`, `api/resource-client.ts`, new `validation/` module (pure rule evaluation + body walk), `request/pipeline.ts`, `transfer/counting.ts` (limit), `transport/fetch.ts`, `errors/validation-error.ts`, `mock/files-exec.ts` (response size only), `index.ts` |
| `packages/mocking` (private) | re-export of new public types only, if any                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/react` (private)   | **no source change expected**: rules are config, not hook options; type/runtime verification only. Any change needs a stated reason                                                                                                                                                                                                                                                                                              |
| `apixa` facade (`src/`)      | explicit re-exports of additions; `tests/facade/curated-root-exports.json` and the snapshot                                                                                                                                                                                                                                                                                                                                      |
| `scripts/`                   | `verify-type-consumers.mjs`, `verify-unified-consumer.mjs`, `verify-browser.mjs`, `verify-edge.mjs`, fixtures                                                                                                                                                                                                                                                                                                                    |
| `examples/next`              | one validation scenario; no other example touched                                                                                                                                                                                                                                                                                                                                                                                |

No new workspace packages and no new dependencies.

## Compatibility requirements

- Without rules nothing changes: no body walk, no wrapped stream, the `TransportRequest` seen by a
  custom transport is identical to v1.3.0's, results and errors are identical.
- `fileFields` shorthand (array) and `{ name }` forms keep working and keep their typing and entity
  checks. Rule fields are additions to `FileFieldOptions`.
- `ValidationError` keeps its class, `name`, `code: "VALIDATION"` and `retryable: false`; new fields
  are optional. Existing path-parameter `ValidationError` behavior is unchanged.
- Existing result types, `full`, `responseType`, `onTransfer` semantics, retry policy and error text
  are unchanged. All v1.1.0–v1.3.0 tests pass **without edits**.
- Public API changes are additions only, recorded in `docs/public-api.md` and the snapshot.

## Boundaries

- Core imports nothing (no React, TanStack, `node:*`); rules use `Blob`, `File`, `FormData`,
  streams and string operations only.
- Rule configuration is never part of query keys or cache identity; hooks do not gain options.
- Mocking stays decoupled from production execution: the mock branch calls the same pure validator,
  it does not own a second one.
- Validation reads metadata (`size`, `type`, `name`) only; it never reads file bytes.
