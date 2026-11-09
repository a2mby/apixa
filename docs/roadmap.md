# Roadmap

This roadmap describes possible future capabilities. Do not implement them all at once. The active coding contract is always the current version folder under [`versions/`](../versions/).

## Completed: v0.1.0 — Foundation

**Spec:** [versions/v0.1.0/](../versions/v0.1.0/)

Shipped: `defineApi()`, opt-in operations, type inference, Fetch transport, errors, basic example and tests.

## Completed: v0.2.0 — Default-first resources

**Spec:** [versions/v0.2.0/](../versions/v0.2.0/)

- Path-only resources expose built-in CRUD automatically
- Optional partial `operations` overrides + custom ops
- Resource-level headers and merge precedence
- Updated examples, docs, and tests

## Completed: v0.3.0 — Resource typing (`type<T>()`)

**Spec:** [versions/v0.3.0/](../versions/v0.3.0/)

Shipped branded markers; **removed in v0.4.0** in favor of state typing.

## Completed: v0.4.0 — State typing (`defineApi<T>()`)

**Spec:** [versions/v0.4.0/](../versions/v0.4.0/)

- Resource-only `defineApi<AppApi>()({ … })` (`path` + `entity`)
- Derived `create` / `update`; Core root builtins + `BuiltinHeaders`
- Remove public `type()` / `Type` / `Infer`

## Completed: v0.5.0 — Simple Mocking + remove backend

**Spec:** [versions/v0.5.0/](../versions/v0.5.0/)

- Local JSON datasets + metadata; lightweight on-demand registry
- `@apixa/mocking` mock `Transport` (not coupled to Core production execution)
- Remove FastAPI `backend/` and backend scripts
- No website; future online catalog documented as planned only

## Completed: v0.6.0 — Core request reliability

**Spec:** [versions/v0.6.0/](../versions/v0.6.0/)

- Cancellation and `AbortSignal` as a first-class, documented surface
- Documented timeouts (call / operation / resource / api)
- Configurable opt-in retries (safe defaults for idempotent methods)
- Thin middleware / interceptors as a stable public API
- Core only — no client/server packages, schema library, or TanStack package

## Completed: v0.7.0 — Thin Core + plugin seams

**Spec:** [versions/v0.7.0/](../versions/v0.7.0/)

- Types cleanup (ApiState, path-param concat, list/query, delete dead types)
- Runtime: hasBody-by-method, body passthrough, query array format / serializer
- RequestOptions: retry, responseType, meta, full → ApiResponse
- Breaking middleware reshape (re-callable next, richer context)
- Retry hooks: respectRetryAfter, shouldRetry, onRetry
- Plugin seams: ResourceExtensions / OperationExtensions; mock keys leave Core types
- Error codes + isHttpError / isTimeoutError
- Out: auth, cache, validation, pagination helpers

## Completed: v0.8.0 — Unified TanStack Query resource integration

**Spec:** [versions/v0.8.0/](../versions/v0.8.0/)

- Optional package `@apixa/tanstack-query` with unified `useResourceQuery`
- List query state, Promise CRUD, invalidate-first cache, per-mutation state, Apixa inference
- Advanced escape hatch export; Next playground migrated; Core stays framework-agnostic
- Deferred: `patch-list` / optimistic helpers, infinite queries, auto custom ops

## Completed: v0.9.0 — Flatten Core mock syntax

**Spec:** [versions/v0.9.0/](../versions/v0.9.0/)

- Replace `mock: true` + `mockConfig` with `mock: "<dataset-id>"`
- Move mock `pagination` to resource level (sibling of `path` / `slice` / `mock`)
- Fill Core `MockDatasetIds` so autocomplete needs no `@apixa/mocking` import
- `defineMockApi` string shorthand; docs/tests migration; no new mock engine features

## Completed: v0.10.0 — Fully customizable resource operations

**Spec:** [versions/v0.10.0/](../versions/v0.10.0/)

- `operations` accepts a config object, a function, or `false` (removes a built-in) per key
- Custom and built-in operations surface identically: `api.resource.<name>()`
- Suggested-keys typing on `operations` for autocomplete of known operation names
- 11 new always-on builtins (same default-first treatment as the original 5): `getBySlug`, `patch`,
  `upsert`, `count`, `search`, `bulkCreate`, `bulkDelete`, `getMany`, `exists`, `findFirst`, `getBy`
- Mirrored surface on `@apixa/mocking` (both `mock: "<id>"` and `defineMockApi`)

## Completed: v0.11.0 — Harden v0.10.0 + close analyzed gaps

**Spec:** [versions/v0.11.0/](../versions/v0.11.0/)

- `ParseError` on malformed declared-JSON bodies; single `decideRetry` per attempt
- `useResourceMutation` for builtins/custom ops outside `useResourceQuery`
- Documents `pagination` / `readOnly` and mock-bridge extended routes (much of that surface already
  landed with v0.10.0 via shared files)

## Release candidate: v1.0.0 TanStack integration overhaul

**Spec:** [versions/v1.0.0/](../versions/v1.0.0/)

- Step 1 (#62): `useResourceQuery` is query-only; `useResourceMutation` runs every write (create /
  update / delete / builtins / custom); controller split into query + mutation controllers
- Query workstream: native v5 options/results, typed built-in and declared custom reads,
  query-options factory, cache controller, cancellation, App Router hydration, and consumer builds
- Query, resource-wide `useResourceMutation`, the `useResource` facade, and Core `kind`
  classification are implemented on the task branch; release is still pending

- Final packaging: one `apixa` npm package, private modular workspaces, optional framework peers
  and isolated public subpaths (ADR 005). Vue and Angular remain future work.

## Current: v1.3.0 — File Transfer Progress, Streaming & Reliability

**Spec:** [versions/v1.3.0/](../versions/v1.3.0/) (implemented and verified; owner sign-off open)

- One opt-in, typed `onTransfer` event mechanism (start, progress, complete, error, abort, with
  retry `attempt`) on `RequestOptions` and operations; no second client or package
- Download progress for every `responseType`; `total` only from trustworthy `Content-Length`
- Upload progress only where the runtime can observe bytes; otherwise an honest "unsupported"
  signal, never a fabricated percentage
- Streaming bodies with backpressure; a `stream` result stays cancellable and time-limited after the
  operation resolves; interrupted transfers classified consistently; retry rules unchanged
- Typed through builtins, custom operations, `ctx.request()` and hooks; verified through React
  18/19, packed npm consumers, Chromium, Node, Next, Vercel Edge and workerd

## Implemented, owner sign-off open: v1.2.0 — File Downloads & Binary Responses

**Spec:** [versions/v1.2.0/](../versions/v1.2.0/)

- Operation-level `responseType` (declarative operations; per call still wins) that **infers** the
  result type: `Blob`, `ArrayBuffer`, `string`, `ReadableStream`; metadata `response` still wins
- Download metadata through the existing `{ full: true }` `ApiResponse`, plus a pure
  `parseContentDisposition` helper
- Binary-safe pipeline: no JSON parsing, key transforms or builtin shaping; failed downloads keep a
  readable `HttpError` body; truthful 204 values for explicit binary modes
- Mock downloads read the v1.1.0 virtual file store from `mock` handlers (headers synthesized,
  isolation and reset preserved)
- Verified through React 18/19, packed npm consumers, Chromium, Node, Next SSR, Vercel Edge and
  workerd. Implemented and verified (`pnpm verify`); owner sign-off open. One published `apixa` package.

## Implemented, owner sign-off open: v1.1.0 — Advanced File Handling, first release

**Spec:** [versions/v1.1.0/](../versions/v1.1.0/)

- Resource-level `fileFields` (shorthand or `{ name }`), checked against the entity; reads keep
  `string` / `string[]`, eligible writes accept `File | Blob`
- JSON by default; multipart chosen automatically when a body holds binary values; operation
  `dataFormat` override; documented bracket / repeated-name serialization
- Minimal in-memory mock file storage (bytes separate from records, string references on reads)
- Binary-safe pipeline, `SerializationError`, React type compatibility; no new packages
- Implemented and verified (`pnpm verify`); sign-off and landing on `main` pending. One published `apixa` package.

## Planned: Advanced File Handling (nine phases)

Phases 1 is **v1.1.0** (with minimal mock storage pulled in by owner decision). The rest are roadmap
headings only until each milestone starts. A dedicated React Hook Form integration is a separate
optional milestone **after** file handling.

1. File-field foundation, automatic serialization and minimal mock file storage — **v1.1.0**
2. Extended CRUD/custom operations and advanced serialization
3. Downloads and binary responses — **v1.2.0**
4. Transfer progress, cancellation, streaming, and reliability — **v1.3.0**
5. Middleware, validation, file limits, and error handling
6. Advanced mock file storage (virtual disks, fixtures, lifecycle) on top of the v1.1.0 store
7. React/TanStack and form compatibility, browser/Node integration, and testing
8. Large-file uploads, chunking, resumability, parallel transfers, and storage adapters
9. File lifecycle management, cleanup policies, performance, documentation, and release hardening

## Later: Proposed backlog catalog (planning only)

Eighteen separately scoped proposals (`v0.12.0`–`v0.29.0`) live under
[`docs/apixa-backlog-versions/`](./apixa-backlog-versions/backlog/README.md). They are **not**
active coding contracts and must not be copied into `versions/` until `/start-version`
promotes one. Topics include TanStack hardening, Zod, unified package/public API cleanup, CI,
uploads/downloads, WebSockets, webhooks, auth adapters, SSE, OpenAPI, observability, and
benchmarks.

## Later: Developer experience follow-ups

- Optional schema validation hooks (without baking in a schema library)
- Operation `deprecated` / versioning metadata (ties to the v1.0.0 API-versioning item below;
  premature before then)
- Request deduplication / in-flight coalescing in `@apixa/tanstack-query` (not Core)
- Dataset catalog codegen from `datasets/manifest.json` (tooling, not library surface)

## Later: Environment and integrations

- Browser and server packages
- Secure server-only configuration (secrets must not leak to browser bundles)
- Further `@apixa/tanstack-query` depth (infinite queries, optimistic/`patch-list` helpers) after v0.8.0
- Other data-fetching library integrations
- File uploads, downloads, and streaming where appropriate

## Stable platform: v1.0.0 and beyond

- OpenAPI import/export
- Reusable resource definitions and API versioning
- Additional transports (if Fetch-in-Core is no longer enough)
- Observability and tracing
- CLI tooling and optional code generation
- Plugin ecosystem

## Dependency direction (all phases)

```text
integrations → core
core ↛ integrations
```

Core remains framework-agnostic. Caching and UI state management stay outside Core.
