# v0.3.0 — Implementation plan

Smallest path to `type<T>()` markers and `Infer`. Reshape Core types; do not add packages or dependencies.

## Design decisions to lock while coding

1. **Marker API:** Exact shapes in `types/marker.ts` — `Type<T>`, `type<T>()`, `Infer<M>` with `unique symbol` brand. Only cast: inside `type()`.
2. **Operation fields:** `body?: Type<unknown>`, `response?: Type<unknown>`. Missing `response` ⇒ `unknown`.
3. **Inference:** `InferBody` / `InferResponse` unwrap with `Infer<>`. Path arity / positional args unchanged.
4. **Breaking:** Non-`Type` values (including `{} as User`) must not type-check on `body` / `response`.
5. **Exports:** `type`, `Type`, `Infer` from package root next to `defineApi`.
6. **No** resource-level `types` bag, `crud<>()`, schema libs, or call-style changes in this milestone.

## Target developer surface

```ts
import { defineApi, type } from "@apixa/core";

type User = { id: string; name: string; email: string };

const api = defineApi({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    operations: {
      getAll: { method: "GET", response: type<User[]>() },
      getByID: { method: "GET", path: "/:id", response: type<User>() },
      create: {
        method: "POST",
        body: type<Omit<User, "id">>(),
        response: type<User>(),
      },
      update: {
        method: "PUT",
        path: "/:id",
        body: type<Partial<User>>(),
        response: type<User>(),
      },
      delete: {
        method: "DELETE",
        path: "/:id",
        response: type<void>(),
      },
    },
  },
});

await api.users.getAll(); // Promise<User[]>
await api.users.create({ name: "Ada", email: "ada@example.com" }); // Promise<User>
```

## Ordered steps

### 1. Marker module + exports

Files: `packages/core/src/types/marker.ts`, `packages/core/src/types/index.ts`, `packages/core/src/index.ts`

- Implement `Type`, `type`, `Infer` as specified.
- Re-export from types barrel and package entry.

### 2. OperationDefinition + inference unwrap

Files: `packages/core/src/types/definition.ts`, `packages/core/src/types/inference.ts`

- Type `body` / `response` as `Type<unknown>` (optional).
- Unwrap with `Infer<>` in body/response inference helpers.
- Keep path arity and positional signatures.

### 3. Tests

Files: `tests/core/` (new or extended type tests), update existing marker usages

- `type<User[]>()` → `Promise<User[]>`.
- Op with `body: type<Create>()` → body argument is `Create`.
- `{} as User` on `response` / `body` fails typecheck (`expectTypeOf` / `@ts-expect-error`).
- Prior runtime tests still pass.

### 4. Example and docs

Files: `examples/next/lib/api.ts` (local), `README.md`, living docs, `CHANGELOG.md`, `docs/story.md`

- Migrate example to `type<T>()`.
- Document breaking change; create root or package `CHANGELOG.md` if missing.
- Mark `crud<>()` and path-param inference as planned follow-ups.

## File touch list

| Path                                    | Change                                |
| --------------------------------------- | ------------------------------------- |
| `packages/core/src/types/marker.ts`     | New — `Type`, `type`, `Infer`         |
| `packages/core/src/types/definition.ts` | `body` / `response` as `Type<…>`      |
| `packages/core/src/types/inference.ts`  | Unwrap via `Infer<>`                  |
| `packages/core/src/types/index.ts`      | Export markers                        |
| `packages/core/src/index.ts`            | Public export `type`, `Type`, `Infer` |
| `tests/core/*.test.ts`                  | Marker inference + breaking cases     |
| `examples/next/lib/api.ts`              | `type<T>()` usage                     |
| `README.md`, `docs/*`, `CHANGELOG.md`   | DX + breaking note                    |
| `docs/story.md`                         | Implementation outcome                |

## Non-steps

- Do not add `crud<>()` or a resource `types` bag.
- Do not add a schema library or runtime validation.
- Do not change call-style to object bags.
- Do not implement abort / retries / middleware / mocking / pagination.
- Do not create packages beyond Core.
- Do not rewrite frozen `versions/v0.1.0/` or `versions/v0.2.0/`.
