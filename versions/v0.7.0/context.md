# v0.7.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Make **Core thin and stable** so features ship as plugins: tighter types, leaner request options, re-callable middleware, richer retry hooks, and extension seams — without new product features outside the locked list.

> Core owns definitions, execution, and seams. Mocking, auth, cache, validation, and pagination helpers stay outside (or augment via `declare module`).

## Identity (this release)

- Packages: `@apixa/core` (primary) + `@apixa/mocking` only where Core removes `mock` / `mockConfig` types (augmentation + processor stay)
- Tagline: Define your API once. Use it everywhere.
- Stack: TypeScript + pnpm monorepo
- Rules: **minimal code**, no features beyond this list, lean files, explicit over implicit; update existing tests; add tests only for new behavior

## What success looks like

```ts
import { defineApi, type Middleware } from "@apixa/core";

type AppApi = {
  users: {
    path: "/orgs/:orgId/users";
    entity: User;
    list?: User[]; // optional; default Entity[]
    query?: { active?: boolean };
  };
};

const refresh: Middleware = async (ctx, next) => {
  let res = await next();
  if (res.status === 401) {
    // refresh token…
    res = await next(); // safely re-callable
  }
  return res;
};

const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  queryArrayFormat: "repeat",
  middleware: [refresh],
  users: { path: "/orgs/:orgId/users" },
});

// path params from resource + op; list/query typed on getAll
await api.users.getAll({ orgId: "acme" }, { query: { active: true } });

// full response envelope when requested
const raw = await api.users.getByID("1", { full: true });
raw.status; // number
```

Exact signatures locked in the implementation plan. Mock keys live on `@apixa/mocking` via module augmentation, not Core’s published resource types.

## Principles that bind this release

1. Thin Core — plugins / packages own product features.
2. Explicit over implicit — defaults documented; overrides stay opt-in.
3. Native `Promise` — unwrapped `T` by default; `full: true` → `ApiResponse<T>`.
4. Framework-agnostic; no React / TanStack Query in Core.
5. Extension seams: empty `ResourceExtensions` / `OperationExtensions` + `registerDefineApiProcessor`.
6. Breaking changes are named and migrated in CHANGELOG.
7. Minimal code; reshape existing modules; tests for new behavior only.

## Intentionally out

- Auth, cache, validation packages
- Live pagination / filter / sort helpers
- `@apixa/client` / `@apixa/server` / TanStack / OpenAPI
- New features not listed in [scope.md](./scope.md)

See [scope.md](./scope.md).
