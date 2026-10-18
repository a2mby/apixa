# Architecture

This document describes the architecture Apixa is building toward, and how the current codebase maps to it.

Apixa Core owns definitions and live HTTP execution. `@apixa/mocking` (v0.5.0) is a separate package that injects a mock `Transport` — Core never depends on it. Other optional packages (client, server, TanStack Query, OpenAPI) remain planned boundaries.

## High-level shape

```text
defineApi({ baseURL, headers, resources })
        │
        ▼
   typed API client
        │
        ├── resource (users, posts, …)
        │       ├── generated operations (getAll, getByID, create, …)
        │       └── custom operations (explicit endpoints)
        │
        ▼
   request pipeline
        │
        ├── URL / path / query construction
        ├── headers + body serialization
        ├── Transport.request(...)
        └── parse / errors → Promise<T>
```

```mermaid
flowchart TD
  defineApi[defineApi] --> resources[Resources]
  resources --> generated[Generated operations]
  resources --> custom[Custom operations]
  generated --> pipeline[Request pipeline]
  custom --> pipeline
  pipeline --> transport[Transport]
  transport --> fetchDefault[Fetch default]
  transport --> testTransport[Test transport]
  pipeline --> promise[Promise T]
```

## Design rules

1. **Single source of truth** — resources and operations are defined once.
2. **Type inference first** — argument, body, and response types come from definitions.
3. **Default-first conventions** — built-in CRUD exists for a resource with `path`; optional `operations` merges overrides; custom/explicit settings win.
4. **Native promises** — no custom Promise wrappers in Core.
5. **Framework-agnostic** — Core must not depend on React, Next.js, or TanStack Query.
6. **Transport-backed** — HTTP runs through a `Transport` interface; Fetch is the default implementation and stays **inside Core** until a package split is justified.

See also:

- [001-framework-agnostic-core.md](./decisions/001-framework-agnostic-core.md)
- [002-transport-abstraction.md](./decisions/002-transport-abstraction.md)

## Request flow

1. Caller invokes a resource operation (for example `api.users.getByID("123")`).
2. Core builds path, query, headers, and body from the definition and call arguments.
3. Core calls `transport.request(...)`.
4. On success, Core returns typed data as `Promise<T>` (prefer unwrapping response `data` for query-fn compatibility).
5. On failure, Core throws a standardized `ApiError` subclass (`HttpError`, `NetworkError`, etc.).

## Source map (`packages/core`)

| Responsibility                          | Intended home | Notes                                                 |
| --------------------------------------- | ------------- | ----------------------------------------------------- |
| API / resource definition (`defineApi`) | `api/`        | `defineApi` + resource client wiring                  |
| Operation helpers                       | `operation/`  | Convention defaults, arg parsing, operation callers   |
| Request execution pipeline              | `request/`    | URL/headers/body → transport → unwrapped `Promise<T>` |
| Fetch transport                         | `transport/`  | Default Fetch transport, kept in Core for v0.1.0      |
| Errors                                  | `errors/`     | `ApiError` / `HttpError` / `NetworkError` / …         |
| Shared types                            | `types/`      | HTTP, transport, definition, client inference         |
| URL / serialization helpers             | `http/`       | Path, query, headers, body, timeout signal            |
| Public exports                          | `index.ts`    | `defineApi`, types, errors, Fetch / `Transport`       |

Out of Core’s product mock engine (owned by `@apixa/mocking`):

- Core exposes `registerDefineApiProcessor` so integrations can transform config before the client is built
- Resource `mock` / `mockConfig` keys are opaque to Core; `@apixa/mocking` must be imported to handle them
- Auth helpers and logging middleware as Core product features
- Schema validation as a Core dependency

## Workspace today vs planned

**Today:**

```text
packages/core/
packages/mocking/   # local datasets + mock Transport (v0.5.0)
datasets/           # version-controlled JSON fixtures
examples/next/      # primary playground (uses mocking)
tests/              # vitest — Core + mocking
```

**Planned later (do not create yet):**

```text
packages/transport-fetch/
packages/client/
packages/server/
packages/tanstack-query/
packages/openapi/
```

A future **online dataset catalog** may reuse the local `meta.json` shape; hosting is not implemented.

Integrations always depend on Core. Core never depends on integrations.

## Related docs

- Living context: [context.md](./context.md)
- Roadmap: [roadmap.md](./roadmap.md)
- Coding contract: [../versions/v0.5.0/](../versions/v0.5.0/)
