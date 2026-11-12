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

## Installation

Apixa publishes one npm package: `apixa` (`1.0.0-rc.0`, ESM, Node.js 22+). That release candidate is
published on npm under both the `latest` and `next` dist-tags; later repository milestones (v1.1.0
through v1.8.0) are merged but not yet published. Install the published RC with:

```sh
# Core, Mocking and the root entry: this is all you need
npm install apixa

# React applications: add TanStack Query (React 18 or 19 is already in your app)
npm install apixa @tanstack/react-query
```

Framework integrations are **optional peer dependencies**, so `npm install apixa` never pulls in a
framework you do not use:

| You import                                   | You must also have installed                                  |
| -------------------------------------------- | ------------------------------------------------------------- |
| `apixa`, `apixa/core`, `apixa/mocking*`      | nothing                                                       |
| `apixa/react`, `apixa/react/advanced`        | `react` (^18 or ^19) and `@tanstack/react-query` (^5.90.1)    |
| future framework subpaths (e.g. `apixa/vue`) | that framework's own peers, documented when the subpath ships |

npm does not install optional peers for you. `apixa/react` uses the copies in _your_ application;
Apixa does not bundle them.

**Troubleshooting: React hooks lose their types.** If `@tanstack/react-query` is missing (or not
resolvable from `node_modules/apixa`, for example in some monorepo layouts), `useResource`,
`useResourceQuery` and `useResourceMutation` cannot infer their results. Apixa types them as
`ApixaMissingPeer_Install_tanstack_react_query`, so the first property you read (`users.data`) is
a compile error. Fix it with `npm install @tanstack/react-query`. `skipLibCheck: true` hides
TypeScript's own "Cannot find module" error inside `node_modules`; `skipLibCheck: false` shows it
(TS2307). At runtime the missing package is a module-not-found error when `apixa/react` loads.

Downloads are ordinary operations: declare `responseType: "blob"` (or `"arrayBuffer"`, `"text"`) on an
operation and the result is typed (`Blob`, …); use `{ full: true }` for status and headers and
`parseContentDisposition(headers).filename` for the file name. See the
[Core README](packages/core/README.md#file-downloads-and-binary-responses).
Transfer progress is opt-in: pass `onTransfer` on any call for typed start / progress / complete /
error / abort events with retry attempts, honest totals, and `unsupported` where the runtime cannot
observe a transfer ([details](packages/core/README.md#transfer-progress-streaming-and-cancellation)).
File rules are opt-in too: size, count, MIME, extension and response limits next to `fileFields` reject locally with a
typed `ValidationError` before any request — developer experience, not security ([details](packages/core/README.md#file-validation-opt-in)).

```ts
import { defineApi, defineApis, defineMockApi } from "apixa";
import { MockStore } from "apixa/core";
import "apixa/mocking/register";
import { users } from "apixa/mocking/datasets/users";
import { listDatasets } from "apixa/mocking/node"; // Node-only
```

```tsx
import {
  QueryClient,
  ApixaProvider,
  ApixaHydrationBoundary,
  useResource,
  useResourceQuery,
  useResourceMutation,
} from "apixa/react";
// Server Components use the server-safe entry:
import { QueryClient as ServerQueryClient, dehydrate } from "apixa/react/advanced";
```

Framework subpaths keep integrations isolated. Root, Core and Mocking imports require neither
React nor TanStack Query. React and TanStack Query are optional peers, left external to the
library build; install them only when using `apixa/react` (see the install table above). Missing
peers produce the loader's module-not-found error when a React entry is imported. Future
`apixa/vue` and `apixa/angular` subpaths are planned, not implemented; each will declare its own
optional peers the same way.

Core, Mocking, React and shared integration helpers remain private workspace modules. Their
canonical code is compiled into one distribution with shared runtime chunks. No scoped package
installation is required. See the [installation guide](./docs/guides/humans/install-apixa.md)
and [public API contract](./docs/public-api.md).

### Runtime support

| Runtime                                      | Status                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Node.js 22, 24                               | Supported (CI matrix)                                                                                                      |
| Modern browsers                              | Supported (verified in Chromium)                                                                                           |
| Cloudflare Workers                           | `apixa`, `apixa/core`, `apixa/mocking*` (not `/node`) and `apixa/react/advanced`, run in `workerd` without `nodejs_compat` |
| Vercel Edge Runtime                          | Same entries, run in `edge-runtime`                                                                                        |
| React 18 / 19, Next.js 15 App Router, Vite 6 | Supported (packed consumers, production and development builds)                                                            |
| TypeScript 5.5+                              | Declarations checked with 5.5.4 and the latest release, `Bundler` and `NodeNext` resolution                                |

`apixa/mocking/node` reads the file system and is Node-only. Thrown errors keep `error.request`
(including headers and body) readable but non-enumerable, so logging an error does not print
credentials.

## Core Principles

- **Define once:** Keep API definitions in a single source of truth.
- **Type-safe by design:** Infer request arguments and response types from definitions.
- **Convention-driven:** Generate common resource operations where appropriate.
- **Fully customizable:** Support custom endpoints and override generated behavior.
- **Framework-agnostic:** Keep the core independent of UI frameworks and data-fetching libraries.
- **Composable:** Allow additional capabilities through isolated subpaths.

## Usage (implemented)

Minimal resource — built-in CRUD is generated from `path`:

```ts
import { defineApi } from "apixa";
const api = defineApi({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json" },
  resources: { users: { path: "/users" } },
});

await api.users.getAll();
await api.users.getById("123");
await api.users.create({ name: "Ada", email: "ada@example.com" });
await api.users.update("123", { name: "Ada Lovelace" });
await api.users.delete("123");
```

Typed payloads use a Zustand-style **resource-only** state generic (no `type()` helper).
`create` / `update` are derived from `entity` (`Omit<Entity,"id">` / `Partial<Entity>`).
Root config (`baseURL`, `headers`, …) is typed by Core — not listed on `AppApi`:

```ts
import { defineApi } from "apixa";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: {
    entity: User;
  };
};

const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json", "X-Client": "dashboard" },
  resources: {
    users: {
      path: "/users",
      operations: {
        getAll: { path: "/active" },
        patch: { path: "/:id" },
        archive: { kind: "write", method: "POST", path: "/:id/archive" },
      },
    },
  },
});
```

Operations return native `Promise<T>` (response data is unwrapped). A resource path generates 16
builtins by default. The runtime resource config chooses paths and enabled methods; the optional
generic supplies payload types. `operations` can disable a builtin with `false`, restore it with
`true`, override it with a partial config, or define a custom operation with an explicit
`kind: "read" | "write"`. Custom functions use `{ kind, run }`. HTTP methods must agree with
the operation kind. `createMany` and
`deleteMany` replace the former `bulkCreate` and `bulkDelete` names while retaining `/bulk` as
their default wire path.

```ts
const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  resources: {
    users: {
      path: "/users",
      readOnly: true,
      operationGroups: { many: true },
      operations: { create: true, getById: false },
    },
  },
});
// TypeScript exposes only the methods generated by these settings.
```

Set `defaultOperations: false` to start with no builtins, then enable individual operations or
groups. `writeOnly: true` filters read defaults. Group precedence and all default wire conventions
are documented in [docs/conventions.md](docs/conventions.md#selection-order).

Pass `transport` to inject a custom HTTP implementation (used in tests). The default is Fetch, shipped inside Core.

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
  resources: { users: { path: "/users" } },
});
```

Middleware hooks, request middleware, and response middleware run inside Core's request
pipeline. See [`packages/core/README.md`](./packages/core/README.md) for the current API.

See [`packages/core/README.md`](./packages/core/README.md) and CHANGELOG v0.7.0 migration notes.

### Simple Mocking (implemented)

Standalone, in-memory mock API from local datasets — no `defineApi()`, no network, no backend:

```ts
import { defineMockApi } from "apixa/mocking";

const mockApi = defineMockApi({
  resources: {
    users: { type: "users-mock" },
    products: { type: "products-mock", slice: 50, pagination: true },
  },
});

const { data, total } = await mockApi.products.getAll({ page: 1, pageSize: 10 });
```

Typed data: `import { users, type User } from "apixa/mocking/datasets"`.

Or mock individual resources of a Core client (register the included lazy dataset loader):

```ts
import { defineApi } from "apixa";
import "apixa/mocking/register";

const api = defineApi({
  baseURL: "https://api.example.com",
  resources: {
    users: { path: "/users", mock: "users-mock", pagination: "page" },
    payments: { path: "/payments" }, // real network
  },
});
```

See [`datasets/`](./datasets/) and [`packages/mocking`](./packages/mocking).

See [`examples/frontends/query-ssr-next`](./examples/frontends/query-ssr-next) for the maintained, verification-driven Next.js App Router example. [`examples/frontends/next`](./examples/frontends/next) is the untracked local playground; `examples/README.md` lists which other folders are maintained. Backend environment: [`examples/backends/laravel-backend`](./examples/backends/laravel-backend). Platform run scripts: [`scripts/README.md`](./scripts/README.md).

## Vision

Apixa is being designed around a small, extensible core that can grow into a broader API development ecosystem.

**Implemented:** the v0.1.0–v0.11.0 foundation; the v1.0.0 release candidate (single `apixa` package, `apixa/react`, query/mutation/optimistic/cache DX); and the v1.1.0–v1.8.0 file line — uploads and multipart, downloads and binary responses, transfer progress and streaming, validation and limits, advanced mock file storage, framework/SSR file handling, advanced chunk/session transfers, and v1.8.0 hardening. v1.8.1 adds only the independent Laravel/PostgreSQL playground. Detailed status and sign-offs: [versions/README.md](./versions/README.md).

**Planned later (not implemented):**

- `crud<>()` preset.
- Runtime schema validation hooks (no schema library in Core).
- Live pagination, filtering, sorting, and search conventions beyond the current opt-in pagination envelope.
- Online dataset catalog (browse/download) — local datasets only today.
- Vue, Angular, or other framework integrations. TanStack Query integration is implemented as `apixa/react`.
- OpenAPI interoperability.
- Browser and server packages; additional transports extracted from Core.
- Ranged/resumable downloads and a storage-provider SDK.

These planned items are not currently implemented.

## Design Philosophy

Apixa Core will provide API definitions, type inference, and request execution without requiring React, TanStack Query, or a particular runtime framework.

Integrations will build on the core rather than become dependencies of it.

API methods are intended to return native promises, allowing them to work naturally with `async`/`await` and libraries such as TanStack Query.

## Project Structure

```text
src/                # the single public `apixa` facade (re-exports only)
packages/
  core/             # API definitions and execution
  mocking/          # Local datasets and standalone mock APIs
  react/            # Private React integration
  internal/shared/  # Private, never published: framework-neutral integration helpers
datasets/           # Version-controlled JSON fixtures
examples/
  backends/
    laravel-backend/  # Independent Laravel/PostgreSQL/MongoDB playground (no HTTP APIs yet)
  frontends/
    query-ssr-next/   # Maintained Next.js App Router example (verified by pnpm verify)
    next/             # Local, untracked Next.js playground
    ...               # Older local playgrounds; not maintained (see examples/README.md)
  templates/          # Empty laravel/next/react starter placeholders
scripts/            # Build, verification, dataset, frontend and Laravel launchers
tests/              # Vitest suite (core, mocking, react, facade, ai) + packed consumers
docs/               # Living context, architecture, roadmap, public API, use cases, ADRs
versions/           # Frozen milestone contracts (active: v1.8.1)
.ai/                # Canonical rules, roles, adapters and sync script
.agents/skills/     # Canonical reusable workflows
```

Planned later packages (not created yet): `transport-fetch`, `client`, `server`, `openapi`.

## Virtual mock files

Mocked file uploads use client-scoped in-memory storage by default. Optional disks, safe virtual
paths, naming and lazy dataset fixtures extend that same store; UUID references stay compatible.
See [advanced mock file storage](packages/core/README.md#advanced-mock-file-storage) for the
implemented API, ownership, reset and atomic managed-handler boundaries. No storage driver or
filesystem dependency is required.

## Documentation

| Doc                                            | Purpose                                                |
| ---------------------------------------------- | ------------------------------------------------------ |
| [docs/context.md](./docs/context.md)           | Project identity, principles, constraints              |
| [docs/architecture.md](./docs/architecture.md) | Core shape and request flow                            |
| [docs/conventions.md](./docs/conventions.md)   | How we build and document                              |
| [docs/public-api.md](./docs/public-api.md)     | Export contract for every public entry point           |
| [docs/roadmap.md](./docs/roadmap.md)           | Milestones and future phases                           |
| [docs/use-cases.md](./docs/use-cases.md)       | Manual-testing catalog (all milestones, v0.1.0–v1.8.1) |
| [versions/v1.8.1/](./versions/v1.8.1/)         | **Active coding contract** (scope, plan, acceptance)   |
| [.ai/README.md](./.ai/README.md)               | AI rule/skill/role layout and provider adapters        |
| [docs/story.md](./docs/story.md)               | Dated project log, newest first                        |

## Project Status

Apixa is in early development. The published package is the `1.0.0-rc.0` release candidate (npm
`latest` and `next`), not a stable release. Repository milestones v1.1.0–v1.7.0 are merged and
verified with owner sign-off recorded for v1.5.0 and v1.7.0; v1.8.0 is merged with CI green and its
final sign-off not inferred; v1.8.1 is the active environment-only milestone. Exact per-milestone
status is [versions/README.md](./versions/README.md).

See [versions/v1.8.1/acceptance-criteria.md](./versions/v1.8.1/acceptance-criteria.md) for the active milestone checklist.

## Author

Created and maintained by **Abdalrahman bani younes** ([a2mby](https://github.com/a2mby)).

## License

Apixa is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

Advanced chunk/session uploads (implemented in v1.7.0, not yet npm-published) are explicit operation strategies through the same Core request
pipeline. Ordinary file uploads/downloads keep their existing zero-config behavior. See the
[advanced transfer guide](packages/core/README.md#advanced-transfers-v170) for typed checkpoints,
server reconciliation, bounded concurrency, controls, presigned security and the SDK-free S3 recipe.

Contributors can use the independent [Laravel/PostgreSQL backend playground](examples/backends/laravel-backend/README.md) for real HTTP infrastructure experiments.
