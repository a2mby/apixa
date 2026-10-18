# Apixa — Project Context and Development Direction

> **Current milestone:** none open — last shipped [v0.5.0](../versions/v0.5.0/) (Simple Mocking + local datasets + remove backend).
> Previous: [v0.4.0](../versions/v0.4.0/) (entity-only `defineApi<T>()`); [v0.3.0](../versions/v0.3.0/) (`type<T>()`, removed later); [v0.2.0](../versions/v0.2.0/); [v0.1.0](../versions/v0.1.0/).
> This file is the living project context. Version folders freeze a milestone; update this file when direction changes.

## 1. Project Identity

Apixa is an open-source, TypeScript-first library for defining APIs and automatically generating fully typed API clients.

**Tagline:** Define your API once. Use it everywhere.

- Copyright holder: Abdalrahman bani younes
- GitHub: https://github.com/a2mby
- License: MIT
- Current stage: Initial development
- Primary language: TypeScript
- Package manager: pnpm

Apixa is a library for building API clients. It is not merely a Fetch wrapper, a server-routing framework, or a UI framework.

## 2. The Problem Apixa Solves

Developers repeatedly implement the same API mechanics across resources and projects:

- Request functions for every endpoint.
- Request and response types.
- URL and parameter construction.
- Request body serialization.
- Shared headers and authentication configuration.
- Response parsing and validation.
- Error handling.
- Common resource operations such as fetching, creating, updating, and deleting records.

Apixa aims to eliminate this repetition through a single API definition.

A developer should define a resource once and receive a predictable, fully typed interface for interacting with it.

## 3. Core Design Principles

1. **Single source of truth:** Define API resources and operations in one place.
2. **Type inference first:** Infer request arguments, bodies, and response types from definitions.
3. **Convention-driven:** Generate common resource methods where appropriate.
4. **Customizable:** Allow developers to override, extend, or disable generated operations.
5. **Native promises:** Operations return ordinary `Promise<T>` values.
6. **Framework-agnostic:** Core must not depend on React, Next.js, TanStack Query, or other UI/data-fetching libraries.
7. **Composable:** Advanced functionality should be introduced without unnecessarily complicating the core.
8. **Environment-aware:** Server-only secrets must never leak into browser bundles.
9. **No false assumptions:** A resource definition must not imply that every conventional endpoint exists on the backend.

## 4. Apixa Core

Core is the foundation of the entire ecosystem. It defines APIs, generates resource methods, infers types, and executes requests.

Its initial responsibilities are:

- `defineApi()` — define the API and its resources.
- Resource and endpoint definitions.
- Default-first built-in CRUD on resources, with optional partial operation overrides.
- Request argument and response type inference.
- URL, path parameter, and query parameter construction.
- Request body serialization.
- Shared configuration and headers.
- Request execution through a transport interface.
- Fetch as the initial/default transport where appropriate.
- Response parsing and standardized errors.
- A clean, stable public export surface.

Keep the initial core small and cohesive. Do not implement every future feature before validating the core design.

## 5. Intended Developer Experience

**Implemented direction (v0.2.0 + v0.4.0):** a resource with `path` gets built-in CRUD; type payloads via resource-only `defineApi<AppApi>()({ … })`.

```ts
import { defineApi } from "@apixa/core";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: { path: "/users"; entity: User };
};

const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json" },
  users: { path: "/users" },
});

const users = await api.users.getAll();
const user = await api.users.getByID("123");
```

Built-in operations: `getAll`, `getByID`, `create`, `update`, `delete` (positional args). `create` / `update` bodies are derived from `entity` (`Omit` / `Partial` on `"id"`). Root builtins (`baseURL`, `headers` / `BuiltinHeaders`, `transport`, `timeout`) are typed by Core — not listed on `AppApi`. Optional runtime `operations` merges overrides and custom endpoints.

**Planned later:** `crud<>()` preset, path-param template inference, `idKey`, `getBySlug` / `getByUUID` / `getBy`, runtime schema validation hooks.

Prefer clear semantics. For example, `update()` is a clearer default than an ambiguous operation such as `appendUser()`.

## 6. TanStack Query Compatibility

TanStack Query is a future optional integration, not a Core dependency.

Apixa operations must behave naturally as query and mutation functions:

```ts
useQuery({
  queryKey: ["users"],
  queryFn: api.users.getAll,
});

useMutation({
  mutationFn: api.users.create,
});
```

The exact types depend on the final operation signatures.

Core must not implement its own caching or state-management system just to support TanStack Query.

A future `@apixa/tanstack-query` package may provide:

- Query-key factories.
- Query-options factories.
- Mutation helpers.
- Cache invalidation conveniences.
- Pagination and infinite-query helpers.

The same architecture should permit future integrations with other data-fetching libraries.

**Dependency direction:** Integrations depend on Core. Core never depends on integrations.

## 7. Intended Workspace Structure

The planned repository structure is:

```text
packages/
  core/
  transport-fetch/
  client/
  server/
  mocking/
  tanstack-query/
  openapi/

examples/
  basic/

README.md
LICENSE
package.json
pnpm-workspace.yaml
tsconfig.json
```

The intended responsibilities are:

- `core`: API definitions, type inference, operation generation, and execution.
- `transport-fetch`: Fetch transport implementation, if separation proves useful.
- `client`: Browser-specific configuration and behavior.
- `server`: Server-specific configuration and behavior.
- `mocking`: **Implemented (v0.5.0)** — local JSON datasets, registry, mock `Transport`, and resource-level `mock` / `mockConfig` via Core’s `registerDefineApiProcessor` (Core does not implement mock execution).
- `tanstack-query`: Optional TanStack Query integration (planned).
- `openapi`: OpenAPI interoperability (planned).

Do not prematurely implement remaining packages or introduce unnecessary cross-package dependencies.

Local fixtures live under `datasets/`. A future online catalog is planned only.

## 8. Possible Core Source Structure

An initial layout could be:

```text
packages/core/src/
  index.ts
  api/
  operation/
  request/
  errors/
  types/
  http/
  transport/
```

Each folder owns one concern; keep modules short. Avoid speculative abstractions and unnecessary boilerplate.

## 9. Future Roadmap

### Foundation

- API and resource definitions.
- Configurable generated operations.
- Type inference.
- Request execution and URL construction.
- Headers and request customization.
- Response parsing and standardized errors.
- Basic example.

### Reliability and developer experience

- Cancellation and `AbortSignal`.
- Timeouts and configurable retries.
- Middleware and interceptors.
- Optional schema validation.
- Mocking and contract tests.
- Pagination, filtering, sorting, and search conventions.

### Environment and integrations

- Browser and server packages.
- Secure server-only configuration.
- TanStack Query integration.
- Other data-fetching library integrations.
- File uploads, downloads, and streaming where appropriate.

### Advanced ecosystem

- OpenAPI import/export.
- Reusable resource definitions and API versioning.
- Additional transports.
- Observability and tracing.
- CLI tooling and optional code generation.
- Plugin ecosystem.

This roadmap describes possible future capabilities. Do not implement them all at once.

## 10. Non-Negotiable Constraints

- Do not add React, Next.js, or TanStack Query as Core dependencies.
- Do not return custom Promise wrappers when ordinary promises can satisfy the requirement.
- Do not duplicate types unnecessarily.
- Do not silently invent endpoint behavior.
- Do not require generated operations when a custom endpoint is more appropriate.
- Do not couple mocking to production request execution.
- Do not expose server secrets to browser code.
- Do not build caching, state management, or framework integrations into Core.
- Do not add abstractions merely because they may be useful someday.
- Keep documentation honest about which features are implemented versus planned.

## 11. Immediate Objective

Establish a minimal, scalable Core that proves the main idea:

A developer defines a resource in a few lines, obtains a fully typed client, and executes real HTTP requests without manually implementing every repetitive request function.

The first milestone is a coherent `defineApi()` API, reliable generated operations, explicit customization, native Promise-based execution, and strong TypeScript inference.

Before implementing, inspect the existing repository and its configuration. Preserve working setup, identify what already exists, and propose the smallest implementation plan consistent with this context.

Do not start building future integrations before Core's API design is established.

**Guiding principle: Define the API once. Let Apixa handle repetitive mechanics. Keep application-specific behavior explicit and customizable.**
