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

## Later: Developer experience follow-ups

- Optional schema validation hooks (without baking in a schema library)
- Pagination, filtering, sorting, and search conventions (live API)

## Later: Environment and integrations

- Browser and server packages
- Secure server-only configuration (secrets must not leak to browser bundles)
- Optional `@apixa/tanstack-query` integration
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
