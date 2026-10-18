# v0.2.0 — Implementation plan

Smallest path to default-first CRUD + partial overrides. Reshape Core; do not add packages.

## Design decisions to lock while coding

1. **Default builtins:** Every resource with `path` gets `getAll`, `getByID`, `create`, `update`, `delete` unless a later opt-out is added (none in this milestone).
2. **`operations` optional:** Missing `operations` ⇒ all five defaults. Present `operations` ⇒ shallow merge onto defaults by operation name; unknown names are custom ops.
3. **Partial override:** Overriding `getAll.path` does not drop other fields or other builtins.
4. **Call signatures:** Keep positional args from v0.1.0 (`getByID(id)`, `update(id, body)`).
5. **Types:** Resource client type = builtins ∪ declared custom/override keys, with override shapes refining method/path/body/response when provided.
6. **Schema:** No runtime schema field in this milestone; continue `body` / `response` type markers.
7. **Resource `request`:** Only ship if wired through transport (e.g. `credentials`); otherwise leave out of public types.

## Target developer surface

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json" },
  users: {
    path: "/users",
    headers: { "X-Client": "dashboard" },
    operations: {
      getAll: { path: "/active", response: {} as User[] },
      update: { method: "PATCH", body: {} as Partial<User>, response: {} as User },
      search: {
        method: "GET",
        path: "/search",
        query: {} as { q: string },
        response: {} as User[],
      },
    },
  },
});

await api.users.getAll();
await api.users.getByID("123");
await api.users.update("123", { name: "Ada" });
await api.users.search({ query: { q: "ada" } });
```

## Ordered steps

### 1. Types: optional `operations` + default resource client

Files: `packages/core/src/types/definition.ts`, `packages/core/src/types/inference.ts`

- `ResourceDefinition.operations` optional.
- Infer builtins even when `operations` is absent.
- Merge override operation definitions into effective op types.

### 2. Runtime: expand resource ops from conventions

Files: `packages/core/src/operation/*`, `packages/core/src/api/resource-client.ts`

- Build effective operation map = `CONVENTION_DEFAULTS` ∪ `resource.operations`.
- `resolveOperation` already supplies method/path defaults; ensure path-only resources never require an empty `operations` object.
- Apply resource-level headers when resolving/executing.

### 3. Merge semantics in the request path

Files: `packages/core/src/request/execute.ts`, `packages/core/src/http/headers.ts`, types for resolved resource config

- Precedence: API → resource → operation → call options.
- Header merge by key; scalar method/timeout most-specific wins.

### 4. Tests

Files: `tests/core/default-operations.test.ts`, `tests/core/config-merge.test.ts`, update `define-api.test.ts` / `http.test.ts`

- Cover path-only builtins, method/path overrides, header inheritance, custom coexistence, inference.

### 5. Examples and docs

Files: `examples/basic`, `examples/next/lib/api.ts`, `README.md`, living docs, `docs/story.md`

- Minimal path-first definition first; advanced overrides second.

## File touch list

| Path                                       | Change                                                       |
| ------------------------------------------ | ------------------------------------------------------------ |
| `packages/core/src/types/definition.ts`    | Optional `operations`; resource headers / request if shipped |
| `packages/core/src/types/inference.ts`     | Default builtin client types                                 |
| `packages/core/src/operation/*`            | Effective op map + resolve                                   |
| `packages/core/src/api/resource-client.ts` | Build defaults + overrides                                   |
| `packages/core/src/request/execute.ts`     | Resource-level merge                                         |
| `tests/core/*.test.ts`                     | New + updated cases                                          |
| `examples/basic`, `examples/next`          | Minimal definitions                                          |
| `README.md`, `docs/*`                      | Honest DX                                                    |

## Non-steps

- Do not add a schema library.
- Do not change to object-style call args.
- Do not add TanStack Query, retries, or pagination.
- Do not create `packages/*` beyond Core.
- Do not rewrite frozen `versions/v0.1.0/`.
