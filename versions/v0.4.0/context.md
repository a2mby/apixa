# v0.4.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Replace branded `type<T>()` markers with a Zustand-style **resource-only** state generic on `defineApi<T>()`, derive create/update from `entity`, and type root config + common headers inside Core.

## What success looks like

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

await api.users.getAll(); // Promise<User[]>
await api.users.create({ name: "Ada", email: "ada@example.com" }); // Omit<User,"id">
```

## Principles that bind this release

1. Developer state = resources (`path` + `entity`); root builtins live on Core.
2. `create` / `update` are derived — not declared on `T`.
3. `BuiltinHeaders` documents common headers; values still passed by the developer.
4. Native `Promise<T>`; no React / Next / TanStack Query; no store/cache in Core.
5. Docs honest: `type()` removed (breaking).

## Intentionally out

- Store/cache, `idKey`, schema libs, mocking package, abort/retries product API, new packages
