# Architecture

This document describes the architecture Apixa is building toward, and how the current codebase maps to it.

Apixa Core owns definitions and live HTTP execution. `@apixa/mocking` is a separate package: a standalone in-memory mock API (`defineMockApi()`) plus resource `mock: "<dataset-id>"` support. Core lists mocking as an **optional peer** and lazy-loads `@apixa/mocking/register` when `mock` is present — it does not embed a mock engine. Other optional packages (client, server, TanStack Query, OpenAPI) remain planned boundaries.

## High-level shape

```text
defineApi({ baseURL, headers, resources })
        │
        ▼
   typed API client
        │
        ├── resource (users, posts, …)
        │       ├── generated operations (getAll, getById, create, …)
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
7. **Operations are add / remove / override, by name** (v0.10.0) — `operations` accepts a config object, a function, or `false` per key. `false` removes a builtin; a function runs through the same pipeline via a bound `ctx.request()`. 11 builtins added in v0.10.0 (`getBySlug`, `patch`, `upsert`, `count`, `search`, `bulkCreate`, `bulkDelete`, `getMany`, `exists`, `findFirst`, `getBy`) are always-on, the same default-first treatment as the original 5 (see [conventions.md](./conventions.md#operation-customization-v0100)).

See also:

- [001-framework-agnostic-core.md](./decisions/001-framework-agnostic-core.md)
- [002-transport-abstraction.md](./decisions/002-transport-abstraction.md)

## Request flow

1. Caller invokes a resource operation (for example `api.users.getById("123")`).
2. **Config-object operations:** Core builds path, query, headers, and body from the definition and call arguments. **Function operations:** Core calls the function with a bound `ctx.request()` helper; the function decides what to send.
3. Optional `middleware` runs once around the logical call (including retries).
4. Core calls `transport.request(...)` (with opt-in retry on safe failures).
5. On success, Core returns typed data as `Promise<T>` (response body unwrapped).
6. On failure, Core throws a standardized `ApiError` subclass (`HttpError`, `NetworkError`, `AbortError`, `TimeoutError`, etc.) — the same for both operation styles.

## Source map (`packages/core`)

| Responsibility                          | Intended home | Notes                                                            |
| --------------------------------------- | ------------- | ---------------------------------------------------------------- |
| API / resource definition (`defineApi`) | `api/`        | `defineApi` + resource client wiring                             |
| Operation helpers                       | `operation/`  | Convention defaults, arg parsing, operation callers              |
| Request execution pipeline              | `request/`    | URL/headers/body → middleware → retry → transport → `Promise<T>` |
| Fetch transport                         | `transport/`  | Default Fetch transport, kept in Core                            |
| Errors                                  | `errors/`     | `ApiError` / `HttpError` / `NetworkError` / `AbortError` / …     |
| Shared types                            | `types/`      | HTTP, transport, definition, retry, middleware, client inference |
| URL / serialization helpers             | `http/`       | Path, query, headers, body, timeout signal                       |
| Public exports                          | `index.ts`    | `defineApi`, types, errors, Fetch / `Transport`                  |

Out of Core’s product mock engine (owned by `@apixa/mocking`):

- Core exposes `registerDefineApiProcessor` so integrations can transform config before the client is built
- Resource `mock: "<dataset-id>"` (+ sibling `slice` / `pagination`): Core strips keys and deferred-loads the optional `@apixa/mocking` peer (or uses a registered processor). No hard dependency; clear error if the peer is missing at request time
- Full auth / logging frameworks (thin `middleware` only — v0.6.0)
- Schema validation as a Core dependency

## Workspace today vs planned

**Today:**

```text
packages/core/
packages/mocking/          # defineMockApi + typed data + Core mock processor
packages/tanstack-query/   # optional; unified useResourceQuery (v0.8.0)
datasets/                  # version-controlled JSON fixtures
examples/next/             # primary playground (uses mocking + tanstack-query)
tests/                     # vitest — Core + mocking + tanstack-query
```

**Planned later (do not create yet):**

```text
packages/transport-fetch/
packages/client/
packages/server/
packages/openapi/
```

A future **online dataset catalog** may reuse the local `meta.json` shape; hosting is not implemented.

Integrations always depend on Core. Core never depends on integrations.

## Related docs

- Living context: [context.md](./context.md)
- Roadmap: [roadmap.md](./roadmap.md)
- Latest coding contract: [../versions/v0.8.0/](../versions/v0.8.0/) (shipped; see [versions/README.md](../versions/README.md))
