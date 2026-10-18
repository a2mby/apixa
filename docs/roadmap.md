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

## Current: v0.4.0 — State typing (`defineApi<T>()`)

**Spec:** [versions/v0.4.0/](../versions/v0.4.0/)

- Resource-only `defineApi<AppApi>()({ … })` (`path` + `entity`)
- Derived `create` / `update`; Core root builtins + `BuiltinHeaders`
- Remove public `type()` / `Type` / `Infer`

## Next: Reliability and developer experience (approx. v0.5.0)

- Cancellation and `AbortSignal` as a first-class, documented surface
- Timeouts and configurable retries
- Middleware / interceptors as a stable public API
- Optional schema validation hooks (without baking in a schema library)
- Dedicated mocking package or utilities (not coupled to production execution)
- Pagination, filtering, sorting, and search conventions

## Later: Environment and integrations (approx. v0.5.0)

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
