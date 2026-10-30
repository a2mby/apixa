# Apixa

**Define your API once. Use it everywhere.**

Apixa is an open-source, TypeScript-first library for defining APIs and generating fully typed API clients from a single source of truth.

Instead of repeatedly writing request functions, types, URL construction, and response handling for every resource, Apixa aims to let you define your API once and handle the repetitive mechanics automatically.

## Why Apixa?

Working with APIs often means repeating the same patterns across resources and projects:

- Writing request functions for every endpoint.
- Maintaining request and response types separately.
- Reimplementing headers, parsing, and error handling.
- Repeating common resource operations.
- Integrating API calls with different data-fetching libraries.

Apixa aims to reduce this duplication while preserving TypeScript's type safety and flexibility.

## Core Principles

- **Define once:** Keep API definitions in a single source of truth.
- **Type-safe by design:** Infer request arguments and response types from definitions.
- **Convention-driven:** Generate common resource operations where appropriate.
- **Fully customizable:** Support custom endpoints and override generated behavior.
- **Framework-agnostic:** Keep the core independent of UI frameworks and data-fetching libraries.
- **Composable:** Allow additional capabilities through optional packages.

## Usage (implemented)

Minimal resource — built-in CRUD is generated from `path`:

```ts
import { defineApi } from "@apixa/core";

const api = defineApi({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json" },
  users: {
    path: "/users",
  },
});

await api.users.getAll();
await api.users.getByID("123");
await api.users.create({ name: "Ada", email: "ada@example.com" });
await api.users.update("123", { name: "Ada Lovelace" });
await api.users.delete("123");
```

Typed payloads use a Zustand-style **resource-only** state generic (no `type()` helper).
`create` / `update` are derived from `entity` (`Omit<Entity,"id">` / `Partial<Entity>`).
Root config (`baseURL`, `headers`, …) is typed by Core — not listed on `AppApi`:

```ts
import { defineApi } from "@apixa/core";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: {
    path: "/users";
    entity: User;
  };
};

const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json", "X-Client": "dashboard" },
  users: {
    path: "/users",
    operations: {
      getAll: { path: "/active" },
      update: { method: "PATCH" },
    },
  },
});
```

Operations return native `Promise<T>` (response data is unwrapped). Built-ins are `getAll`, `getByID`, `create`, `update`, and `delete`. `operations` is optional and merges onto those defaults; custom operation names coexist with builtins.

Pass `transport` to inject a custom HTTP implementation (used in tests). The default is Fetch, shipped inside `@apixa/core`.

### Request reliability (implemented)

Per-call cancel and timeout via `RequestOptions` (call → operation → resource → api). Abort → `AbortError`; timeout → `TimeoutError`.

```ts
const controller = new AbortController();
await api.users.getAll({ signal: controller.signal, timeout: 5_000 });
controller.abort();
```

Opt-in retries (default methods `GET` / `HEAD`; network errors, `408` / `429` / `5xx`):

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  timeout: 10_000,
  retry: { retries: 2, baseDelayMs: 200 },
  users: { path: "/users" },
});
```

Thin middleware: `next()` returns `ApiResponse` and may be called more than once (e.g. refresh then retry):

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: [
    async (ctx, next) => {
      ctx.request.headers.set("X-Trace", "1");
      return next();
    },
  ],
  users: { path: "/users" },
});
```

See [`packages/core/README.md`](./packages/core/README.md) and CHANGELOG v0.7.0 migration notes.

### Simple Mocking (implemented)

Standalone, in-memory mock API from local datasets — no `defineApi()`, no network, no backend:

```ts
import { defineMockApi } from "@apixa/mocking";

const mockApi = defineMockApi({
  users: { type: "users-mock", slice: 100, pagination: true },
  products: { type: "products-mock", slice: 50 },
});

const { data, total } = await mockApi.users.getAll({ page: 1, pageSize: 10 });
```

Typed data: `import { users, type User } from "@apixa/mocking/data"`.

Or mock individual resources of a Core client (`@apixa/mocking` as a dependency; no side-effect import):

```ts
import { defineApi } from "@apixa/core";

const api = defineApi({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    mock: true,
    mockConfig: { type: "users-mock", pagination: true },
  },
  payments: { path: "/payments" }, // real network
});
```

See [`datasets/`](./datasets/) and [`packages/mocking`](./packages/mocking).

See [`examples/next`](./examples/next) for the primary real-app playground (Next.js). Other frontends and a Node CLI live under [`examples/`](./examples/). Platform run scripts: [`scripts/README.md`](./scripts/README.md).

## Vision

Apixa is being designed around a small, extensible core that can grow into a broader API development ecosystem.

**Implemented:** `defineApi()` with default-first CRUD (v0.2.0), resource-only `defineApi<T>()(config)` (v0.4.0), `@apixa/mocking` + datasets (v0.5.0), request reliability (v0.6.0), thin Core + plugin seams — path-param concat, `full` / middleware re-call, extension interfaces, structured error codes (v0.7.0).

**Planned later:**

- `crud<>()` preset.
- Runtime schema validation hooks (no schema library in Core).
- Live pagination, filtering, sorting, and search conventions.
- Online dataset catalog (browse/download) — local datasets only today.
- Optional TanStack Query integration package.
- Browser and server packages.
- OpenAPI interoperability.
- Additional transports extracted from Core.

These planned items are not currently implemented.

## Design Philosophy

Apixa Core will provide API definitions, type inference, and request execution without requiring React, TanStack Query, or a particular runtime framework.

Integrations will build on the core rather than become dependencies of it.

API methods are intended to return native promises, allowing them to work naturally with `async`/`await` and libraries such as TanStack Query.

## Project Structure

```text
packages/
  core/             # API definitions and execution
  mocking/          # Local datasets helpers + mock Transport
datasets/           # Version-controlled JSON fixtures
examples/
  next/             # Primary frontend playground (Next.js)
  react-vite/ vue/ vanilla/ angular/ react-native/ basic/
scripts/            # Frontend run scripts (macOS / Linux / Windows)
tests/              # Vitest suite for core + mocking
docs/               # Living context, architecture, roadmap, ADRs
versions/
  v0.7.0/           # Latest coding contract (shipped)
```

Planned later packages (not created yet): `transport-fetch`, `client`, `server`, `tanstack-query`, `openapi`.

## Documentation

| Doc                                            | Purpose                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| [docs/context.md](./docs/context.md)           | Project identity, principles, constraints            |
| [docs/architecture.md](./docs/architecture.md) | Core shape and request flow                          |
| [docs/roadmap.md](./docs/roadmap.md)           | Milestones and future phases                         |
| [docs/conventions.md](./docs/conventions.md)   | How we build and document                            |
| [versions/v0.7.0/](./versions/v0.7.0/)         | **Latest coding contract** (scope, plan, acceptance) |

## Project Status

Apixa is in early development. Last shipped: **v0.7.0** (thin Core + plugin seams). `@apixa/core` exposes `defineApi()` with default-first CRUD, reliability, re-callable middleware, and extension seams. `@apixa/mocking` augments Core for resource mocks.

See [versions/v0.7.0/acceptance-criteria.md](./versions/v0.7.0/acceptance-criteria.md) for the milestone checklist.

## Author

Created and maintained by **Abdalrahman bani younes** ([a2mby](https://github.com/a2mby)).

## License

Apixa is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
