# `@apixa/mocking`

Standalone, in-memory mock APIs built from local JSON datasets. **No network requests, no backend, no `defineApi()`.**

## `defineMockApi()`

```ts
import { defineMockApi } from "@apixa/mocking";

export const mockApi = defineMockApi({
  resources: {
    users: { type: "users-mock", readOnly: true, operations: { getBySlug: false } },
    products: { type: "products-mock", slice: 50, operations: { delete: false } },
    countries: { type: "countries-csc", pagination: true },
  },
});

const { data, total } = await mockApi.countries.getAll({ page: 1, pageSize: 10 });
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

The config mirrors `defineApi`: each key under `resources` becomes a property on the returned client, typed from its dataset. Type `defineMockApi({` and let autocomplete guide you: root settings, then the resource's options, then `operations`. No generic, entity type or callback annotation is needed.

> The older flat form, `defineMockApi({ users: "users-mock" })`, still works as a compatibility shorthand. Prefer `resources`.

| Option       | Meaning                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | Dataset id (table below). Autocompletes; unknown ids throw `UNKNOWN_DATASET`.                                                                                    |
| `slice`      | First N records, or `{ start, end }` (half-open). Overshoot returns all rows; negatives / `end < start` throw `InvalidSliceError`. Seed limit, not a growth cap. |
| `pagination` | `getAll()` returns `{ data, total, page, pageSize, previous, next }` and accepts `{ page, pageSize }`.                                                           |

Any other option (`handlers`, `path`, `mock`, …) is a type error and throws `INVALID_CONFIG`.

### Root settings

Core's operation-selection settings (same names and precedence as `defineApi`'s resource settings) may also be set on the **root** of a standalone mock, where they apply to every resource. A resource's own value wins over the root; `operationGroups` merge group by group. Root settings that need a network (`baseURL`, `transport`, `headers`, `retry`, `timeout`, `transforms`, `middleware`, …) do not exist here.

| Setting             | Meaning                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `defaultOperations` | `false` starts with no builtins; enable some with `operationGroups` / `operations`. |
| `readOnly`          | Removes the 7 write builtins (explicit groups / operations still win).              |
| `writeOnly`         | Removes the 9 read builtins (explicit groups / operations still win).               |
| `operationGroups`   | `{ read, write, many, extended }` booleans turn a whole group on or off.            |

Resolution is Core's own: builtin defaults → `defaultOperations` → `readOnly` / `writeOnly` → `extended` → `read` / `write` → `many` → individual `operations` entries. The returned type follows the same rules, so a disabled method is absent from autocomplete and fails type checking.

### Custom operations

`operations` values are `true` (keep a builtin), `false` (remove it), or a function. Functions receive a bound, typed `ctx` first; callers never pass it. A builtin override gets its builtin's arguments automatically; a custom operation infers its arguments and return from the handler (annotate an argument inline when it cannot be inferred):

```ts
const api = defineMockApi({
  resources: {
    users: {
      type: "users-mock",
      operations: {
        getById: async (ctx, id) => (await ctx.rows()).find((row) => row.id === id)!,
        byEmail: async (ctx, email: string) => (await ctx.rows()).find((r) => r.email === email),
      },
    },
  },
});
await api.users.byEmail("a@b.co"); // User | undefined
```

HTTP-shaped operation forms (`{ method, path, … }`) have no local meaning and are rejected (`INVALID_CONFIG`).

### Operations

Each resource has the 16 Core builtins by default (see root settings to trim them). The six CRUD methods:

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

One-based. Defaults: `page = 1`, `pageSize = 20`. `total` is the current record count (after `slice`, creates and deletes).

`page` and `pageSize` must be integers `>= 1`, and `page` can't exceed the last page (an empty resource has one empty page) — otherwise `getAll()` throws `INVALID_PAGINATION`. Passing options to a resource without `pagination: true` throws the same error.

### Errors

Failures extend `MockingErrors` (`MockApiError`, `InvalidSliceError`); branch on `error.code`:
`INVALID_CONFIG` · `UNKNOWN_DATASET` · `NOT_FOUND` · `DUPLICATE_ID` · `INVALID_INPUT` · `INVALID_PAGINATION` · `INVALID_SLICE`.

## Datasets

Loaded from the root [`datasets/`](../../datasets/) catalog (`manifest.json` stays the source of truth). Each dataset is its own lazy chunk, so datasets you never request are never loaded.

| Dataset id            | Entity type       | Id field    | Records | License  |
| --------------------- | ----------------- | ----------- | ------: | -------- |
| `users-mock`          | `User`            | `id`        |     100 | MIT      |
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

## Dataset access — `@apixa/mocking/datasets`

The canonical entry point for reading records yourself. You never need it for `defineMockApi()` or Core's `mock: "users-mock"` — those load their dataset on first use.

```ts
// Lazy: nothing is imported until you call it, and only the selected dataset loads.
import { loadDataset } from "@apixa/mocking/datasets";
const users = await loadDataset("users-mock"); // readonly MockUser[]
const countries = await loadDataset("countries-csc"); // reference sets are lazy-only

// Eager: direct named exports of the small synthetic sets.
import { users, products, companies, orders, posts, comments } from "@apixa/mocking/datasets";
import type { User, Product } from "@apixa/mocking/datasets";
```

|                | `loadDataset(id)`                    | named imports (`users`, …)                                 |
| -------------- | ------------------------------------ | ---------------------------------------------------------- |
| When it loads  | When called (its own chunk)          | When the module is evaluated; unused names are tree-shaken |
| Datasets       | Every catalog id                     | The six small synthetic sets                               |
| Returns / type | `Promise<readonly Entity[]>`         | `readonly Entity[]`                                        |
| Shared array   | Yes — the module-cached source array | Yes — the same array                                       |

Both hand back the module-cached source array: treat it as read-only. Stores made by `defineMockApi()` always copy it. **Direct imports do not save memory** — they only choose when the records load; module caching keeps the source resident either way. `listDatasetIds()` (from the main entry and `/datasets`) is kept for compatibility; `type` autocompletes the ids.

Compatibility paths still work: `@apixa/mocking/data` (the same eager records and entity types, without the loaders) and `@apixa/mocking/data/users-mock`. `loadDatasetRecords(id)` and `@apixa/mocking/register` are unchanged.

### Memory

What stays in memory after a dataset loads:

1. **The source records** — the imported JSON module, cached by the runtime/bundler. Shared by every store and every caller.
2. **One working copy per store** — each `defineMockApi()` resource (and each Core mocked resource) owns the rows it mutates, so state is isolated per resource and per client.
3. **Return copies** — every call returns fresh copies; they are garbage once you drop them.

For built-in datasets the store no longer keeps a _third_ copy (a private snapshot for `reset`): the source slice itself is the reset source. Inline arrays and provider results still get a private snapshot, because the caller can change them after load. Measured with `node --expose-gc scripts/measure-mock-memory.mjs` (`countries-csc`, 250 records, 20 independent stores): about **48% less heap** (0.23 → 0.12 MB per store); the shared source is counted once either way.

**`slice` is a seed window, not a loading optimization.** The dataset's JSON module is imported and validated in full, then the window is applied to what the store copies. A small `slice` reduces the per-store working copy only; the full source stays resident in the module cache. Truly skipping unselected records would need a chunked or indexed data format — not implemented.

## Core inline mocking

Install `@apixa/mocking` next to `@apixa/core` for **runtime** mocks. Types for `mock` / `slice` / `pagination` and known catalog ids ship on Core — no mocking import needed for autocomplete. Import `@apixa/mocking/register` once before requesting a named dataset. This registers a loader only; records still load lazily and each Core client keeps its own mock state. Core and inline mocks do not depend on Mocking.

```ts
import { defineApi } from "@apixa/core";
import "@apixa/mocking/register";
import type { User } from "@apixa/mocking/datasets";

const api = defineApi<{ users: { path: "/users"; entity: User } }>()({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    mock: "users-mock",
    slice: 100,
    pagination: true,
  },
  payments: { path: "/payments" }, // real network
});
```

- `mock` is a dataset id string (a registered preset id).
- `slice` and `pagination` are Core resource options (next to `path` / `mock`): on live resources `slice` caps `getAll` array results; with `mock` set it seeds the mock store (creates may still grow past the seed).
- Mocked resources never hit the network; others use the normal transport.
- With `pagination: true`, list GET returns `{ data, total, page, pageSize, previous, next }` (`page` / `pageSize` query; defaults `1` / `20`).
- Built-in presets for this path live under `@apixa/mocking/datasets` (compat: `@apixa/mocking/data` and `@apixa/mocking/data/users-mock`).

### Customizing `mock` suggestions

Core ships known catalog ids on `MockDatasetIds`. App-specific ids still merge via `declare module` (same idea as runtime `registerDatasetPreset`). Import that module in the app that calls `defineApi`, and the id appears in `mock` autocomplete.

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
    mock: "pets-sample", // ← suggested alongside built-in ids
    slice: 50,
    pagination: true,
  },
});
```

Notes:

- Built-in catalog ids live in Core’s `MockDatasetIds`. Custom app ids still merge from the outside; they accumulate.
- A type-only import of an unrelated entity does **not** add custom ids — only modules that contain a `declare module "@apixa/core"` merge contribute suggestions.
- `mock` is `keyof MockDatasetIds | (string & {})`: known ids autocomplete, custom strings still type-check (the registry is open). Unknown ids fail at **runtime** when the preset is missing.

## Node loaders

`listDatasets` / `loadDataset` (filesystem, returns `{ meta, records }`) live at `@apixa/mocking/node`. Do not import `/node` in browser bundles. The lazy, browser-safe `loadDataset` is the one in `@apixa/mocking/datasets`.

## Removed

`createMockTransport()` (and the unusable `createSelectiveMockTransport` export) are gone. Use `defineMockApi()` for a standalone mock, or `mock: "<dataset-id>"` to mock resources of a Core client.
