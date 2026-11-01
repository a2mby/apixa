# v0.9.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Flatten Core resource mocking so a mocked resource is one short string — not `mock: true` plus a separate `mockConfig` — and move mock page mode next to other resource options. Dataset-id autocomplete must work from `@apixa/core` alone.

> One resource key enables the mock. `path`, `slice`, `pagination`, and `mock` sit together.

## Identity (this release)

- Packages: `@apixa/core` + `@apixa/mocking` (peer reshape only)
- Tagline: Define your API once. Use it everywhere.
- Stack: TypeScript + pnpm monorepo
- Scope: **syntax + types + bridge** — no new mock engine features

## What success looks like

```ts
import { defineApi } from "@apixa/core";

type AppApi = {
  users: {
    path: "/users";
    entity: User;
  };
};

const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    mock: "users-mock",
    slice: 20,
    pagination: true,
  },
});

// Standalone mock: string when only a dataset id; object when slice / pagination needed
import { defineMockApi } from "@apixa/mocking";

const mockApi = defineMockApi({
  users: "users-mock",
  comments: { type: "comments-mock", slice: 50, pagination: true },
});
```

Typing: `mock` suggests known catalog ids without importing `@apixa/mocking`. Runtime still requires the peer package when any resource sets `mock`.

## Principles that bind this release

1. Prefer reshape over new packages or engine features.
2. Resource-scoped options stay siblings of `path` (`slice`, `pagination`, `mock`).
3. Do not invent mock-only object fields just to avoid a string.
4. Core stays free of React / Next / TanStack Query; mocking stays an optional peer.
5. Docs and Next show only the new syntax after this ships.
6. Breaking change is intentional — no dual `mockConfig` / `mock: true` API.

## Intentionally out

- New mock knobs (delay, fail rate, custom handlers, persistence)
- Object form `mock: { type: "…" }` on `defineApi`
- Live HTTP pagination conventions beyond the existing mock page envelope
- Other `examples/*` besides Next
- New workspace packages

See [scope.md](./scope.md).
