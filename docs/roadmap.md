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

## Later: Developer experience follow-ups

- Harden the v0.10.0 surface (parse failures, mock-bridge gaps, composed-builtin overrides, TanStack
  coverage of all builtins) — candidate for a v0.11.0 milestone
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
