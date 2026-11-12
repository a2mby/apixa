# v0.9.0 — Implementation plan

Smallest path to flatten Core mock syntax. Prefer reshape; do not add mock engine features.

## Design decisions to lock while coding

1. **`defineApi` `mock` is a string only.** Dataset id enables mocking. No boolean. No `mockConfig`. No `mock: { type }`.
2. **`pagination` is resource-scoped** — sibling of `path`, `slice`, and `mock`. Mock bridge reads `resource.pagination === true` the same way it previously read `mockConfig.pagination`.
3. **`slice` stays resource-scoped** (unchanged). Reject `slice` nested under any mock bag if it reappears.
4. **Autocomplete:** Fill `MockDatasetIds` in Core with every id from mocking’s loadable catalog (`users-mock`, `products-mock`, …). Keep `| (string & {})` so custom ids still type-check; unknown ids fail at runtime when the peer registry lacks them.
5. **Legacy:** Presence of `mockConfig`, or `mock: true` / `mock: false`, throws a clear config error pointing at the new shape.
6. **`defineMockApi`:** `Record<string, DatasetId | MockResourceConfig>`. Normalize string entries to `{ type: id }` internally. Object form keeps `type` / `slice` / `pagination`.
7. **Augmentation:** Remove or no-op import-side `MockDatasetIds` merges that were only for autocomplete once Core owns the filled interface (avoid duplicate conflicting merges). Runtime preset registration stays.
8. **Next only** among examples.

## Target developer surface

```ts
const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    mock: "users-mock",
    slice: 20,
    pagination: true,
  },
});

const mockApi = defineMockApi({
  users: "users-mock",
  comments: { type: "comments-mock", slice: 50, pagination: true },
});
```

## Ordered steps

### 1. Core types

Files:

- [`packages/core/src/types/extensions.ts`](../../packages/core/src/types/extensions.ts)
- [`packages/core/src/types/mock-dataset-ids.ts`](../../packages/core/src/types/mock-dataset-ids.ts)
- ambient / processor types if they still mention `mockConfig` ([`packages/core/src/ambient-mocking-register.d.ts`](../../packages/core/src/ambient-mocking-register.d.ts))

Actions:

- `ResourceExtensions`: `mock?: keyof MockDatasetIds | (string & {})`; `pagination?: boolean`; remove boolean `mock` and `mockConfig`
- Populate `MockDatasetIds` with loadable catalog ids
- Update comments that say “empty in Core” / “import mocking for autocomplete”

### 2. Core peer validators

File: [`packages/core/src/api/peer-mocking.ts`](../../packages/core/src/api/peer-mocking.ts) (+ callers in [`define-api.ts`](../../packages/core/src/api/define-api.ts) / processors)

- Treat string `mock` as enabled
- Pass through resource `pagination` / `slice` into the peer spec shape
- Detect and reject `mockConfig`, boolean `mock`, empty string `mock`
- Update “install `@apixa/mocking`” messages to name the new keys

### 3. Mocking bridge + register

Files:

- [`packages/mocking/src/bridge.ts`](../../packages/mocking/src/bridge.ts)
- Related register / processor entry points
- [`packages/mocking/src/core-augmentation.ts`](../../packages/mocking/src/core-augmentation.ts) and data-module `declare module` blocks as needed

- Consume string `mock` + resource-level `pagination`
- Align error strings with Core
- Drop autocomplete-only `MockDatasetIds` augmentation if Core now lists the same ids

### 4. `defineMockApi` string shorthand

File: [`packages/mocking/src/mock-api.ts`](../../packages/mocking/src/mock-api.ts)

- Widen config value type to `DatasetId | MockResourceConfig`
- Normalize before `assertConfig` / `createResource`
- Keep object validation (`type`, `slice`, `pagination` only)

### 5. Tests

Location: [`tests/mocking/`](../../tests/mocking/) (and any Core tests that assert mock keys)

- `defineApi` resource with `mock: "users-mock"` (+ optional `pagination` / `slice`) works
- Legacy `mock: true` + `mockConfig` rejected
- `defineMockApi({ users: "users-mock" })` and mixed string/object configs
- Pagination still yields `Page<T>` when resource `pagination: true` (inline mock path)

### 6. Next example + docs

- [`examples/frontends/next/lib/api.ts`](../../examples/frontends/next/lib/api.ts) and any other Next files using old keys
- [`packages/mocking/README.md`](../../packages/mocking/README.md), root README snippets, guides that mention `mockConfig`
- [`CHANGELOG.md`](../../CHANGELOG.md) — breaking note
- Living docs that still describe boolean mock / `mockConfig`
- Append completion entry to [`docs/story.md`](../../docs/story.md) when acceptance passes

## Explicit non-steps

- Do not add delay, fail rate, handlers, or `mock: { type }` on `defineApi`
- Do not change TanStack Query package APIs
- Do not edit `examples/frontends/basic`, `react-vite`, `vue`, etc.
- Do not create new packages
- Do not rewrite frozen older `versions/v0.*` folders for the new syntax

## Suggested file touch list

| Path                                                   | Action                                                   |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `packages/core/src/types/extensions.ts`                | String `mock` + resource `pagination`; drop `mockConfig` |
| `packages/core/src/types/mock-dataset-ids.ts`          | Fill known ids                                           |
| `packages/core/src/api/peer-mocking.ts`                | Validate / normalize new shape; reject legacy            |
| `packages/core/src/ambient-mocking-register.d.ts`      | Match peer types                                         |
| `packages/core/src/api/define-api.ts`                  | Error copy if needed                                     |
| `packages/mocking/src/bridge.ts`                       | String mock + resource pagination                        |
| `packages/mocking/src/mock-api.ts`                     | String \| object resources                               |
| `packages/mocking/src/core-augmentation.ts` / `data/*` | Trim redundant id merges                                 |
| `packages/mocking/README.md`                           | New syntax                                               |
| `tests/mocking/**`                                     | Update + add cases                                       |
| `examples/frontends/next/lib/api.ts` (+ call sites)    | Migrate                                                  |
| `CHANGELOG.md`, docs as needed                         | Breaking honesty                                         |
| `docs/story.md`                                        | Completion when done                                     |

## Done when

All items in [acceptance-criteria.md](./acceptance-criteria.md) pass.
