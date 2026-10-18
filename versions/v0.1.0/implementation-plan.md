# v0.1.0 — Implementation plan

Smallest path to prove `defineApi` + configurable generated operations + real HTTP. Reuse the existing Core scaffold; do not add packages.

## Design decisions to lock while coding

1. **Return type:** Prefer `Promise<T>` (unwrap `data`) so operations work as `queryFn` / `mutationFn` without adapters. If metadata is needed later, add an escape hatch (for example `.raw` or a separate call option)—not a custom Promise wrapper.
2. **Operation enablement:** Resources must declare which generated ops exist (opt-in list or explicit `operations` config). Do not assume every CRUD method exists.
3. **Custom wins:** If the developer defines a method name that would also be generated, the custom definition takes precedence.
4. **Public rename:** `defineApi` is the public name. Remove or soft-deprecate `createApi` from the public export once `defineApi` works (prefer a clean break at 0.1.0 rather than dual APIs).
5. **Mocks / auth / logging:** Strip `mocks` from the production config path. Keep auth/middleware code private or unexported if still useful internally; do not advertise them as v0.1.0 features.

## Target developer surface (illustrative)

```ts
type User = { id: string; name: string; email: string };

const api = defineApi({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json" },
  users: {
    path: "/users",
    operations: {
      getAll: { method: "GET", response: {} as User[] },
      getByID: { method: "GET", path: "/:id", response: {} as User },
      create: { method: "POST", body: {} as Omit<User, "id">, response: {} as User },
      update: { method: "PUT", path: "/:id", body: {} as Partial<User>, response: {} as User },
      delete: { method: "DELETE", path: "/:id", response: {} as void },
    },
  },
});

await api.users.getAll();
await api.users.getByID("123");
await api.users.create({ name: "Ada", email: "ada@example.com" });
```

Exact type-marker syntax may differ; choose the approach that gives the best inference with the least ceremony. Document the final shape in the example and README.

## Ordered steps

### 1. Freeze the public export surface

File: [`packages/core/src/index.ts`](../../packages/core/src/index.ts)

- Export `defineApi` and the minimal types consumers need.
- Export error classes used by callers (`ApiError`, `HttpError`, `NetworkError`, …).
- Export `createFetchTransport` / `Transport` for advanced use and tests.
- Stop exporting mocks, auth helpers, and logging middleware as public v0.1.0 API (move later or keep unexported).

### 2. Define resource + operation types

Files: [`packages/core/src/types.ts`](../../packages/core/src/types.ts), new or reshaped helpers in `api.ts` / `endpoint.ts`

- Types for API config, resource definition, operation definition.
- Map generated operation names to HTTP method + path relative to resource `path`.
- Support custom operations with full control over method/path/body/response types.

### 3. Implement `defineApi`

File: [`packages/core/src/api.ts`](../../packages/core/src/api.ts)

- Accept `baseURL`, shared `headers`, optional `transport`, and resource map.
- Default `transport` to Fetch (`createFetchTransport()`).
- For each resource, build a client object with configured operations.
- Preserve strong inference from the definition object into the returned client.

### 4. Wire execution through the existing pipeline

Files: [`packages/core/src/client.ts`](../../packages/core/src/client.ts), [`packages/core/src/utils.ts`](../../packages/core/src/utils.ts), [`packages/core/src/transport/fetch.ts`](../../packages/core/src/transport/fetch.ts), [`packages/core/src/errors.ts`](../../packages/core/src/errors.ts)

- Reuse URL join, path interpolation, query string, body serialization.
- Reuse Fetch transport and error hierarchy.
- Simplify the pipeline for v0.1.0: drop mock short-circuit from the hot path; keep timeout/`AbortSignal` if already present and low-cost.
- Return unwrapped `T` (or document if temporarily returning `ApiResponse<T>`—prefer unwrap).

### 5. Clean Core of out-of-scope public features

- Remove or unexport `createMock` / `mocks` config.
- Do not expand auth or middleware into documented features this release.

### 6. Example

File: [`examples/basic/src/index.ts`](../../examples/basic/src/index.ts)

- Rewrite to `defineApi` + resource operations.
- Hit a real or injectable HTTP path; if a live API is unavailable, use a custom `transport` in the example **only if** that demonstrates the public API clearly—prefer documenting a public demo URL or a tiny local mock server only if necessary. Do not reintroduce production `mocks` config.

### 7. Tests

Location: [`tests/`](../../tests/) (see [tests/README.md](../../tests/README.md))

Add a test runner when implementing (for example `vitest` at the workspace or core level—pick one, keep it simple).

Cover at minimum:

- Resource client exposes only configured operations.
- Custom operation overrides a generated name.
- Path params and query strings are built correctly.
- Successful JSON response returns typed data.
- Non-OK HTTP throws `HttpError` (or documented subclass).
- Transport injection is used (fake transport) so tests do not need the network.

### 8. Docs honesty pass

- Update [README.md](../../README.md) usage to match **implemented** API.
- Leave roadmap / planned packages clearly marked as future.
- Append a short entry to [docs/story.md](../../docs/story.md) when acceptance criteria pass.

## Explicit non-steps

- Do not create `packages/transport-fetch`, `client`, `server`, `mocking`, `tanstack-query`, or `openapi`.
- Do not implement `getBySlug` / `getBy` / pagination / retries unless they fall out of a tiny shared helper with zero extra API surface (default: skip).
- Do not add React or TanStack Query.

## Suggested file touch list

| Path                                                      | Action                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/core/src/api.ts`                                | Replace `createApi` with `defineApi` + resource generation |
| `packages/core/src/endpoint.ts`                           | Operation builders / generation helpers                    |
| `packages/core/src/client.ts`                             | Slim pipeline; unwrap data                                 |
| `packages/core/src/types.ts`                              | New definition types; trim public clutter                  |
| `packages/core/src/index.ts`                              | Freeze exports                                             |
| `packages/core/src/utils.ts`                              | Keep / minor fixes                                         |
| `packages/core/src/transport/fetch.ts`                    | Keep                                                       |
| `packages/core/src/errors.ts`                             | Keep                                                       |
| `packages/core/src/mock.ts` / `auth.ts` / `middleware.ts` | Unexport or delete from public path                        |
| `examples/basic/src/index.ts`                             | Rewrite                                                    |
| `tests/**`                                                | Add                                                        |
| `README.md`                                               | Match implemented API                                      |
| `docs/story.md`                                           | Log completion                                             |

## Done when

All items in [acceptance-criteria.md](./acceptance-criteria.md) pass.
