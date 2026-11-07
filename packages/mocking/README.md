# `@apixa/mocking`

In-memory mock APIs for Apixa: inline records, named datasets, providers, and a standalone
`defineMockApi()`. **Mocked resources never touch the network.**

```sh
pnpm add @apixa/core @apixa/mocking   # Core is a peer dependency: one copy, ^0.1.0
```

| Import                           | What it is                                                                                    | Side effect |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| `@apixa/mocking`                 | `defineMockApi`, error classes, lazy `loadDataset`, `listDatasetIds`, types                   | none        |
| `@apixa/mocking/datasets`        | `loadDataset`, the six synthetic sets as named exports, entity types                          | none        |
| `@apixa/mocking/datasets/<name>` | One synthetic set on its own: `users`, `products`, `companies`, `orders`, `posts`, `comments` | none        |
| `@apixa/mocking/register`        | Lets Core's `mock: "<dataset-id>"` load named datasets                                        | **yes**     |
| `@apixa/mocking/node`            | Filesystem loaders (`node:fs`; never import in a browser bundle)                              | none        |

Core never imports this package. Inline records and providers need no Mocking at all.

## Mocking a Core resource

`mock` is a data source. Operation behavior is never configured in `mock`; it lives in `operations`.

```ts
import { defineApi } from "@apixa/core";
import "@apixa/mocking/register"; // once per app, only for named datasets

const api = defineApi({
  baseURL: "https://api.example.com/v1",
  resources: {
    // 1. Inline records: the entity type and id are inferred from the array.
    pets: {
      path: "/pets",
      mock: [
        { id: "1", name: "Rex" },
        { id: "2", name: "Tom" },
      ],
    },
    // 2. A named dataset: loaded lazily, on the first call.
    products: { path: "/products", mock: "products-mock", pagination: "page" },
    // 3. A provider: any function returning records (sync or async), called once per client.
    tasks: { path: "/tasks", mock: async () => [{ id: "t1", title: "Write docs" }] },
    // Not mocked: the normal transport.
    payments: { path: "/payments" },
  },
});
```

- `{ data, idKey, seed }` is also accepted: `mock: { data: rows, idKey: "uid", seed: { limit: 10 } }`.
- Records are validated when the first call loads them (plain objects, unique string/number ids).
  The array you pass is copied at that moment; changing it later does not change the store.
- A mocked resource never reaches a transport, whatever the URL looks like after middleware.
- `pagination` is `"page"` or `"cursor"` (Core rejects `true`). `slice` caps the **list result** of
  `getAll` (first N, or `{ start, end }`); `count`, lookups and writes still see every record.

### Reading with filters and pages

Filters and paging keys go under `query`. Any other key on the options object is **not** a filter.
TypeScript rejects unknown option keys; plain JavaScript ignores them, so a typo like
`getAll({ tenat: "t1" })` returns every row.

```ts
await api.products.getAll({ query: { category: "beauty" } }); // exact match on flat keys
await api.products.getAll({ query: { id: ["1", "3"] } }); // ids
await api.products.getAll({ query: { page: 2, pageSize: 10 } }); // { data, total, page, pageSize }
await api.products.getAll({ query: { page: 999 } }); // an empty page, never an error
await api.products.search({ query: { title: "wooden" } }); // case-insensitive substring
```

Filters match flat keys by string equality (an array means "any of"); nested paths are not
supported. `pagination: "cursor"` returns `{ data, nextCursor }` and takes `{ cursor, pageSize }`.
`page`, `pageSize` and `cursor` must be integers (`>= 1`, `>= 1`, `>= 0`), otherwise the call rejects
with `MOCK_INVALID_INPUT`.

### Custom operations

A mocked resource simulates the 16 builtins by their own intent: overriding a builtin's `path` or
disabling another builtin never changes how it runs. A **declarative** custom operation
(`{ kind, method, path }`) has no behavior a mock could guess, so you state it with an optional
`mock` handler **on the operation itself**:

```ts
const api = defineApi({
  baseURL: "/api",
  resources: {
    users: {
      path: "/users",
      mock: [
        { id: "1", name: "Adam", active: true },
        { id: "2", name: "Sarah", active: false },
      ],
      operations: {
        getActive: {
          kind: "read",
          method: "GET",
          path: "/active",
          mock: ({ records }) => records.filter((user) => user.active),
        },
        archive: {
          kind: "write",
          method: "POST",
          path: "/:id/archive",
          mock: async ({ params, store }) => store.patch(params.id, { archived: true }),
        },
      },
    },
  },
});

await api.users.getActive(); // [{ id: "1", … }]
await api.users.archive("1"); // patches this client's record; getById("1") now has archived: true
```

**When it runs.** The handler runs only when the resource is mocked. On a live resource the
operation is the normal HTTP request and `mock` is ignored. A mocked custom operation **without** a
handler rejects with `MOCK_UNSUPPORTED` naming the operation: it is never guessed from its URL
(`DELETE /purge` does not delete the record `purge`) and never sent to the network. `mock` belongs to
custom declarative operations only; a builtin or a `run` operation that sets it fails when the client
is built. Handlers do not depend on any builtin being enabled (`defaultOperations: false` is fine).

**What it receives** (`context`):

| Field                   | Meaning                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `records`               | A **snapshot copy** of every record, taken when you first read it, typed from the resource's mock data. Editing it changes nothing. Reading it copies the resource, so use `store.list(query)` for big filtered reads and ignore it when you only write.         |
| `store`                 | `get(id)`, `exists(id)`, `list(query?)`, `create`, `update` (replace), `patch`, `delete(id)`. Copies in and out; the same engine as the builtins, so duplicate ids, missing records and unsafe keys (`__proto__`, `constructor`, `prototype`) fail the same way. |
| `params`                | Path parameters (typed from the path, resource path included): `params.id`.                                                                                                                                                                                      |
| `query`, `body`         | What the mock engine sees: after request middleware and request key transforms, exactly like a builtin. Typed from `defineApi<Meta>()` operation `query` / `body`, otherwise `Record<string, unknown>` / `unknown`.                                              |
| `signal`                | Aborts on cancellation or timeout. The call rejects at once; a handler already running cannot be stopped and its writes are not rolled back, so check `signal.aborted` before mutating.                                                                          |
| `resource`, `operation` | Names, for messages.                                                                                                                                                                                                                                             |

Return any value; it flows through response key transforms and response middleware like a builtin's
result. The status is 200, or 204 for a `DELETE` that returns nothing. Throwing (sync or async) goes
through error middleware, which may recover or replay as usual. Each client has its own store, so a
handler's writes are visible to later builtin reads of that client and never to another client;
`resetMock` restores the seed.

**Types.** The client's return type still comes from the real operation, not the handler, so declare
`response` in `defineApi<Meta>()` or `defineApis<Meta>()` to type the call. Metadata describes the
raw backend response. The handler returns that raw shape, and Core applies the configured response
key transform before returning the public result; no cast is needed. `records` take the entity type
inferred from the resource's inline array, provider or named dataset. `defineApis` keeps these types
and full path parameter names independently for each backend.

**Function operations** (`{ kind, run }`) keep working: `ctx.request()` is simulated against the
store for these shapes: `GET/POST ""`, `GET/PUT/PATCH/DELETE "/:id"`, `GET "/count"`, `GET "/search"`,
`GET "/slug/:slug"` and `POST/DELETE "/bulk"`. Anything else (including an absolute URL) rejects with
`MOCK_UNSUPPORTED`. They take no `mock` handler. Core still validates `kind` against the HTTP method.

### Errors, reset and isolation

```ts
import { resetMock } from "@apixa/core";
resetMock(api); // every mocked resource back to its seed (a store that never loaded stays unloaded)
```

Failures are Core's `MockError` (`MOCK_NOT_FOUND`, `MOCK_DUPLICATE_ID`, `MOCK_INVALID_INPUT`,
`MOCK_UNSUPPORTED`, `MOCK_LOAD`). Mock input must not contain the keys `__proto__`, `constructor`
or `prototype` at any depth (`MOCK_INVALID_INPUT`), and filters read own properties only.

Each client and each resource owns its store, so two `defineApi()` calls never share data, and one
module-level client keeps its state between requests. In a server, build a client per request (or
per test) when data must not carry over:

```ts
const makeApi = () => defineApi({/* … */}); // request-scoped: starts from the seed
export const sharedApi = makeApi(); // module-scoped: shared by every request
```

## `defineMockApi()`

A standalone mock: no `defineApi()`, no network. It runs on the same engine as a Core mock, so
`getAll`, filtering, pagination and `slice` behave identically.

```ts
import { defineMockApi } from "@apixa/mocking";

const mockApi = defineMockApi({
  resources: {
    users: { type: "users-mock", readOnly: true },
    comments: { type: "comments-mock", pagination: true, slice: 50 },
    products: { type: "products-mock", seed: { limit: 20 } },
  },
});

const page = await mockApi.comments.getAll({ page: 1, pageSize: 10, postId: "1" });
// { data, total, page, pageSize } — paging keys and filters sit side by side in one object
```

| Option       | Meaning                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `type`       | Dataset id (see the table below). Unknown ids throw `UNKNOWN_DATASET`.                                                               |
| `pagination` | `true` / `"page"`: `{ data, total, page, pageSize }`; `"cursor"`: `{ data, nextCursor }`. Out-of-range pages are empty, as in Core.  |
| `slice`      | Caps the `getAll` list result (first N, or `{ start, end }`). The store keeps every record: `count`, `getById` and writes ignore it. |
| `seed`       | `{ limit, offset }`: start the store with a window of the dataset. Records outside it do not exist for any operation.                |

Root settings (`defaultOperations`, `readOnly`, `writeOnly`, `operationGroups`) follow Core's
precedence; a resource's own value wins. Operation values are `true`, `false` or a function that
receives a typed `ctx` (`rows()`, `defaults`, `fail`) first. HTTP-shaped operations are rejected.
The older flat form `defineMockApi({ users: "users-mock" })` still works.

## Dataset access

```ts
import { loadDataset } from "@apixa/mocking"; // or from "@apixa/mocking/datasets"
const countries = await loadDataset("countries-csc"); // lazy: loaded when called; readonly CountryCsc[]

import { users } from "@apixa/mocking/datasets/users"; // one set, nothing else is loaded
import { users, products } from "@apixa/mocking/datasets"; // named exports from the barrel
```

|                           | `loadDataset(id)`                | `datasets/<name>`       | `datasets` barrel           |
| ------------------------- | -------------------------------- | ----------------------- | --------------------------- |
| Loads                     | when called, in its own chunk    | when imported           | when imported               |
| Datasets                  | every catalog id                 | the six synthetic sets  | the six synthetic sets      |
| Native Node ESM           | root entry loads nothing eagerly | loads only that dataset | evaluates all six           |
| Vite/Rollup, Next/webpack | async chunk                      | only that dataset       | only the names you import   |
| esbuild `--splitting`     | async chunk                      | only that dataset       | **all six** (esbuild limit) |

Use `loadDataset` from the root entry for lazy loading and `datasets/<name>` for a single direct
import. The barrel is convenient, but a named-export barrel cannot avoid evaluating all of its
modules in native Node ESM, and esbuild's code splitting keeps them too. `sideEffects` is declared
only for `register`; it is not a promise that every bundler shakes the barrel.

Both return the module-cached source array, shared by every caller: treat it as read-only. **Direct
imports do not save memory**; they only choose when the records load. Stores always copy.

## Memory

- **Source records**: the imported module, cached once and shared.
- **Per store**: an array of row references plus an id index. Rows are shared with the seed until a
  write replaces them (copy on write); `liveRows()` makes the rows private first.
- **Inline arrays and providers** keep one private snapshot per client, because the caller may change
  the source after load. Named datasets keep none.
- **Reads copy only what they return.** A paginated read clones one page, not the dataset.

Measured on Node 24 (`--expose-gc`, 3 fresh processes, one inline client, records of 7 fields):

| Records | Retained per client | Paged `getAll` (20 rows) |   Filtered, paged |
| ------: | ------------------: | -----------------------: | ----------------: |
|     100 |    2.7 MB (was 2.8) |       0.04 ms (was 0.17) |           0.03 ms |
|  10,000 |    6.6 MB (was 9.8) |       0.04 ms (was 16.0) | 0.33 ms (was 1.9) |
| 100,000 |  41.3 MB (was 73.3) |        0.04 ms (was 169) |   4.0 ms (was 21) |

Named datasets retain 0.17 MB per client (was 0.28) for `countries-csc` with 20 clients. The
100-record figure includes one-time module warm-up. `search` over 100,000 rows is about 1.6 ms
slower than before (own-property reads). `slice` and `seed` do not skip loading: the full module is
imported and validated.

## Datasets

Loaded from the root [`datasets/`](../../datasets/) catalog (`manifest.json` stays the source of truth). Each dataset is its own lazy chunk, so datasets you never request are never loaded. The six `*-mock` sets are also importable one by one (see [Dataset access](#dataset-access)).

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

**Not available** through `defineMockApi()`: `states-csc` (1 MB), `states-parseapi` and `counties-parseapi` (>500 KB, and their id field isn't unique, so `getById` would be ambiguous). They are not bundled; read them from a checkout of the repo's `datasets/` folder with `@apixa/mocking/node` and `{ basePath }`. See [`datasets/ATTRIBUTION.md`](../../datasets/ATTRIBUTION.md) for licenses (ODbL sets are share-alike).

## Node utilities

`@apixa/mocking/node` reads datasets from disk: `loadDataset(id, { basePath })` returns
`{ meta, records }`, `listDatasets({ basePath })` lists them, `getDataset`, `findDatasetDirs` and
`resolveDatasetDir` are the building blocks. The root is `basePath`, then `APIXA_DATASETS_DIR`, then
`./datasets` in the working directory, then the repo's `datasets/` folder when running from a
checkout. **The npm package contains no dataset files**, so an installed app must supply a root (a
folder of `<dataset>/meta.json` + `data.json`), otherwise `loadDataset` rejects and `listDatasets`
returns `[]`. Browser-safe, bundled records come from `@apixa/mocking/datasets`.

## Compatibility

- `@apixa/core` is a **peer dependency** (`^0.1.0`). Install one copy.
- `@apixa/mocking/register` stores its loader in a process-wide slot (`Symbol.for("@apixa/core.mockDatasetLoader")`),
  so it reaches the Core the application runs even if a second copy was installed. The slot holds one
  stateless function; mock stores and data stay per client.
- Without `register`, a named dataset rejects with `MOCK_LOAD` explaining the missing import.

## Removed

`createMockTransport()` and `createSelectiveMockTransport` are gone, and so are `@apixa/mocking/data`
and `@apixa/mocking/data/<id>`. Use `defineMockApi()`, `mock: "<dataset-id>"`, or
`@apixa/mocking/datasets/<name>`.
