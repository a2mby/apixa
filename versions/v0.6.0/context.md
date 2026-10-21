# v0.6.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Ship **Core request reliability**: first-class cancellation (`AbortSignal`), documented timeouts, configurable retries, and a thin middleware / interceptor surface — so live `defineApi` clients are production-ready without new packages.

> Cancel a request. Time it out. Retry safe failures. Hook request/response once. Keep mocking, schema libs, and env packages out of this milestone.

## Identity (this release)

- Package: `@apixa/core` only (reshape existing request pipeline)
- Tagline: Define your API once. Use it everywhere.
- Stack: TypeScript + pnpm monorepo
- Scope: **Core only** — no `@apixa/client`, `@apixa/server`, schema library, or TanStack package

## What success looks like

```ts
import { defineApi } from "@apixa/core";

type AppApi = {
  users: { path: "/users"; entity: User };
};

const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  timeout: 10_000,
  retry: { retries: 2, methods: ["GET"] },
  middleware: [
    async (ctx, next) => {
      // e.g. attach a header, log, or short-circuit
      return next();
    },
  ],
  users: { path: "/users" },
});

const controller = new AbortController();
const users = await api.users.getAll({ signal: controller.signal });
controller.abort(); // → AbortError
```

Exact `retry` / middleware shapes are locked in the implementation plan. Timeout and `signal` already exist in the pipeline; this release makes them a documented, tested product surface and adds retries + thin interceptors.

## Principles that bind this release

1. Native `Promise<T>` — no custom Promise wrappers.
2. Framework-agnostic Core (no React / Next / TanStack Query).
3. Fetch stays the default transport **inside** Core.
4. Prefer reshape of `request/`, `http/`, `errors/`, `types/` over new packages.
5. Retries must be safe by default (idempotent methods / configurable allow-list).
6. Middleware stays thin — not a full auth or logging product.
7. Do not couple mocking to production execution; do not bake in a schema library.
8. Docs honest: planned ≠ implemented.

## Baseline in the repo today

- `timeout` is a root/resource/operation builtin; `createTimeoutSignal` merges timeout + external `AbortSignal`.
- Call options already accept `signal` / `timeout` via `RequestOptions`.
- `AbortError` / `TimeoutError` exist; they are under-documented as a product surface.
- No public retry config or middleware API.

## Intentionally out

- `@apixa/client` / `@apixa/server` / secrets bundling
- Schema validation library or Zod/Valibot integration
- `@apixa/tanstack-query` package
- Live pagination / filter / sort / search conventions
- OpenAPI, uploads/streaming, rewriting frozen v0.1–v0.5 folders

See [scope.md](./scope.md).
