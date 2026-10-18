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

### Simple Mocking (implemented)

Local JSON datasets + `@apixa/mocking` (not coupled to Core’s production Fetch path):

```ts
import { defineApi } from "@apixa/core";
import { createMockTransport } from "@apixa/mocking";
import { loadDataset } from "@apixa/mocking/node"; // Node only — not for Next client bundles

const dataset = await loadDataset("users-sample");
const api = defineApi({
  baseURL: "https://mock.local",
  transport: createMockTransport({ dataset }),
  users: { path: "/users" },
});

await api.users.getAll(); // from datasets/ — no network
```

In the browser / Next client, import JSON and pass it to `createMockTransport` (do not import `@apixa/mocking/node`).
```

See [`datasets/`](./datasets/) and [`packages/mocking`](./packages/mocking).

See [`examples/next`](./examples/next) for the primary real-app playground (Next.js). Other frontends and a Node CLI live under [`examples/`](./examples/). Platform run scripts: [`scripts/README.md`](./scripts/README.md).

## Vision

Apixa is being designed around a small, extensible core that can grow into a broader API development ecosystem.

**Implemented:** `defineApi()` with default-first CRUD (v0.2.0), resource-only `defineApi<T>()(config)` with derived create/update + `BuiltinHeaders` (v0.4.0), URL/body/headers merge, Fetch transport, standardized errors, `@apixa/mocking` + local datasets (v0.5.0).

**Planned later:**

- `crud<>()` preset and path-param template inference.
- Runtime schema validation hooks, middleware, retries, pagination conventions.
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
  v0.5.0/           # Current coding contract
```

Planned later packages (not created yet): `transport-fetch`, `client`, `server`, `tanstack-query`, `openapi`.

## Documentation

| Doc                                            | Purpose                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| [docs/context.md](./docs/context.md)           | Project identity, principles, constraints             |
| [docs/architecture.md](./docs/architecture.md) | Core shape and request flow                           |
| [docs/roadmap.md](./docs/roadmap.md)           | Milestones and future phases                          |
| [docs/conventions.md](./docs/conventions.md)   | How we build and document                             |
| [versions/v0.5.0/](./versions/v0.5.0/)         | **Current coding contract** (scope, plan, acceptance) |

## Project Status

Apixa is in early development. Active milestone: **v0.5.0** (Simple Mocking). `@apixa/core` exposes `defineApi()` with default-first CRUD and injectable `Transport`. `@apixa/mocking` serves local JSON datasets without a live backend.

See [versions/v0.5.0/acceptance-criteria.md](./versions/v0.5.0/acceptance-criteria.md) for the milestone checklist.

## Author

Created and maintained by **Abdalrahman bani younes** ([a2mby](https://github.com/a2mby)).

## License

Apixa is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
