# `@apixa/mocking`

Standalone, in-memory mock APIs built from local JSON datasets. **No network requests, no backend, no `defineApi()`.**

## `defineMockApi()`

```ts
import { defineMockApi } from "@apixa/mocking";

export const mockApi = defineMockApi({
  users: { type: "users-sample", size: 100, pagination: true },
  products: { type: "products-mock", size: 50 },
  countries: { type: "countries-csc" },
});

const { data, total } = await mockApi.users.getAll({ page: 1, pageSize: 10 });
const product = await mockApi.products.getById("1");
await mockApi.products.create({
  title: "Lamp",
  description: "…",
  price: 9,
  brand: "B",
  category: "home",
  stock: 3,
});
```

### Pagination envelope

With `pagination: true`, `getAll()` returns `Page<T>` — not `T[]`:

```ts
const page = await mockApi.users.getAll({ page: 1, pageSize: 10 });
// page.data, page.total, page.page, page.pageSize, page.previous, page.next
```

`previous` / `next` are page numbers (or `null` at the ends). For TanStack Query, keep the page as `queryFn` data and read `.data` in the UI:

```ts
export const commentsQuery = {
  queryKey: ["comments"] as const,
  queryFn: () => mockApi.comments.getAll(),
};

const { data: commentsPage } = useQuery(commentsQuery);
const comments = commentsPage?.data ?? [];
```

Each top-level key is a resource. There are no handlers to write — every resource gets the same CRUD operations, typed from its dataset.

| Option       | Meaning                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `type`       | Dataset id (table below). Autocompletes; unknown ids throw `UNKNOWN_DATASET`.                          |
| `size`       | Load only the first `size` records. A seed limit, not a cap — the resource can grow.                   |
| `pagination` | `getAll()` returns `{ data, total, page, pageSize, previous, next }` and accepts `{ page, pageSize }`. |

Any other option (`handlers`, `path`, `mock`, …) is a type error and throws `INVALID_CONFIG`.

### Operations

| Method               | Behavior                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| `getAll()`           | Plain list, or a page when `pagination: true`.                                          |
| `getById(id)`        | One record. Ids match as strings, so `1` finds `"1"`.                                   |
| `create(input)`      | Appends. A missing id is generated (see below); a duplicate id throws `DUPLICATE_ID`.   |
| `update(id, input)`  | **Replaces** the record. The id is kept; passing a different id throws `INVALID_INPUT`. |
| `patch(id, partial)` | Merges only the supplied fields (`undefined` values are skipped).                       |
| `delete(id)`         | Removes the record; resolves `void`.                                                    |

- **Async, like Core.** Every method returns a `Promise`, which is also how datasets load lazily on first use.
- **Missing records reject.** `getById`, `update`, `patch` and `delete` all throw `MockApiError` with code `NOT_FOUND` — deleting twice fails the second time.
- **Ids follow the dataset.** Datasets with numeric ids (`"1"`, `"2"`, …) get the next number, never reusing a deleted one. Datasets keyed by a natural value (`currencies-parseapi` → `USD`) can't generate ids, so `create()` requires one.
- **State is in memory and private.** Each `defineMockApi()` call (and each resource) starts from the dataset; changes never touch the source data, other instances, or other resources, and are lost on reload.
- **Copies in and out.** Returned records and stored inputs are copies, so callers can't mutate stored state by accident.

### Pagination

One-based. Defaults: `page = 1`, `pageSize = 20`. `total` is the current record count (after `size`, creates and deletes).

`page` and `pageSize` must be integers `>= 1`, and `page` can't exceed the last page (an empty resource has one empty page) — otherwise `getAll()` throws `INVALID_PAGINATION`. Passing options to a resource without `pagination: true` throws the same error.

### Errors

Everything throws `MockApiError`; branch on `error.code`:
`INVALID_CONFIG` · `UNKNOWN_DATASET` · `NOT_FOUND` · `DUPLICATE_ID` · `INVALID_INPUT` · `INVALID_PAGINATION`.

## Datasets

Loaded from the root [`datasets/`](../../datasets/) catalog (`manifest.json` stays the source of truth). Each dataset is its own lazy chunk, so unused ones are never loaded.

| Dataset id            | Entity type       | Id field    | Records | License  |
| --------------------- | ----------------- | ----------- | ------: | -------- |
| `users-sample`        | `User`            | `id`        |       2 | MIT      |
| `users-mock`          | `MockUser`        | `id`        |     100 | MIT      |
| `products-mock`       | `Product`         | `id`        |     100 | MIT      |
| `companies-mock`      | `Company`         | `id`        |      40 | MIT      |
| `orders-mock`         | `Order`           | `id`        |      80 | MIT      |
| `posts-mock`          | `Post`            | `id`        |     100 | MIT      |
| `comments-mock`       | `Comment`         | `id`        |     100 | MIT      |
| `countries-csc`       | `CountryCsc`      | `id`        |     250 | ODbL-1.0 |
| `countries-mledoze`   | `CountryMledoze`  | `id`        |     250 | ODbL-1.0 |
| `countries-parseapi`  | `CountryParseapi` | `country`   |     250 | CC0-1.0  |
| `country-codes-iso`   | `CountryCode`     | `id`        |     250 | MIT      |
| `cities-capitals`     | `CapitalCity`     | `id`        |     245 | ODbL-1.0 |
| `currencies-parseapi` | `Currency`        | `currency`  |     156 | CC0-1.0  |
| `languages-parseapi`  | `Language`        | `language`  |     224 | CC0-1.0  |
| `timezones-parseapi`  | `Timezone`        | `timezone`  |     418 | CC0-1.0  |
| `area-codes-parseapi` | `AreaCode`        | `area_code` |     424 | CC0-1.0  |

**Not available** through `defineMockApi()`: `states-csc` (1 MB), `states-parseapi` and `counties-parseapi` (>500 KB, and their id field isn't unique, so `getById` would be ambiguous). They stay in `datasets/` and load with `@apixa/mocking/node`. See [`datasets/ATTRIBUTION.md`](../../datasets/ATTRIBUTION.md) for licenses (ODbL sets are share-alike).

## Typed data — `@apixa/mocking/data`

```ts
import { users, products } from "@apixa/mocking/data";
import type { User, Product } from "@apixa/mocking/data";
```

Read-only typed records for the small synthetic sets (`users`, `mockUsers`, `products`, `companies`, `orders`, `posts`, `comments`) straight from the root JSON — no copies. Entity types for **every** dataset above are exported too; reference sets (countries, currencies, …) are types only, so importing them costs nothing at runtime.

## Core inline mocking

Install `@apixa/mocking` next to `@apixa/core`. When a resource has `mock` / `mockConfig`, Core lazy-loads `@apixa/mocking/register` on first request — no side-effect `import "@apixa/mocking"` required. You can still call `enableResourceMocks()` or import `@apixa/mocking/register` explicitly (e.g. to fail fast at `defineApi` time via the processor).

```ts
import { defineApi } from "@apixa/core";
import type { User } from "@apixa/mocking/data";

const api = defineApi<{ users: { path: "/users"; entity: User } }>()({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    mock: true,
    mockConfig: { type: "users-sample", size: 100, pagination: true },
  },
  payments: { path: "/payments" }, // real network
});
```

- `mock: true` requires `mockConfig.type` (a registered preset id).
- Mocked resources never hit the network; others use the normal transport.
- With `pagination: true`, list GET returns `{ data, total, page, pageSize }` (`page` / `pageSize` query; defaults `1` / `20`).
- Built-in presets for this path live under `@apixa/mocking/data` (and `@apixa/mocking/data/users`, `…/users-mock`). Importing `@apixa/mocking/data` also teaches TypeScript the known ids (see below).

### Customizing `mockConfig.type` suggestions

Core ships an empty, extensible interface. Dataset modules merge their ids into it (same idea as runtime `registerDatasetPreset`). Import that module in the app that calls `defineApi`, and the id appears in `mockConfig.type` autocomplete.

**1. Register + teach the type (keep these in the same file):**

```ts
// datasets/pets.ts
import { registerDatasetPreset, type Dataset } from "@apixa/mocking";

export type Pet = { id: string; name: string };

const dataset: Dataset = {
  meta: {
    id: "pets-sample",
    title: "Pets sample",
    license: "MIT",
    version: "1.0.0",
    resource: { path: "/pets", idField: "id" },
    schema: {
      fields: [
        { name: "id", type: "string" },
        { name: "name", type: "string" },
      ],
    },
    records: 1,
  },
  records: [{ id: "1", name: "Mochi" }],
};

registerDatasetPreset("pets-sample", dataset);

declare module "@apixa/core" {
  interface MockDatasetIds {
    "pets-sample": true;
  }
}
```

**2. Import it where you define the API (so the merge enters the program):**

```ts
// lib/api.ts
import { defineApi } from "@apixa/core";
import "./datasets/pets"; // runtime register + type merge
import type { Pet } from "./datasets/pets";

export const api = defineApi<{ pets: { path: "/pets"; entity: Pet } }>()({
  baseURL: "https://api.example.com",
  pets: {
    path: "/pets",
    mock: true,
    mockConfig: {
      type: "pets-sample", // ← suggested alongside built-in ids
      size: 50,
      pagination: true,
    },
  },
});
```

Notes:

- Do not edit `@apixa/core`. Each app or package merges its own ids; they accumulate.
- A type-only import of an unrelated entity (e.g. only `CountryCode`) does **not** add geography catalog ids — only modules that contain a `declare module "@apixa/core"` merge contribute suggestions.
- `mockConfig.type` is `keyof MockDatasetIds | (string & {})`: known ids autocomplete, custom strings still type-check (the registry is open). Unknown ids fail at **runtime** when the preset is missing.
- Built-in reference: [`src/data/users.ts`](./src/data/users.ts) (same `registerDatasetPreset` + `declare module` pair).

## Node loaders

`listDatasets` / `loadDataset` live at `@apixa/mocking/node` (filesystem). Do not import `/node` in browser bundles.

## Removed

`createMockTransport()` (and the unusable `createSelectiveMockTransport` export) are gone. Use `defineMockApi()` for a standalone mock, or `mock: true` / `mockConfig` to mock resources of a Core client.
