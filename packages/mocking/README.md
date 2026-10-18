# `@apixa/mocking`

Local JSON datasets and mock request handling for Apixa.

Mocking is **not** implemented inside Core’s production request path. Importing this package registers a Core `defineApi` **processor** that honors resource-level `mock` / `mockConfig`.

## Resource-level mocking (recommended)

```ts
import "@apixa/mocking"; // enables mock / mockConfig on Core defineApi
import { defineApi } from "@apixa/core";

const api = defineApi({
  baseURL: "https://api.example.com",
  users: {
    path: "/users",
    mock: true,
    mockConfig: {
      type: "users-sample",
      size: 100,
      pagination: true,
    },
  },
  payments: {
    path: "/payments", // real network
  },
});
```

- `mock: true` requires `mockConfig.type` (dataset / preset id).
- Mocked resources never hit the network; others use the normal transport.
- With `pagination: true`, list GET returns `{ data, total, page, pageSize }` (`page` / `pageSize` query; defaults `1` / `20`). `size` is applied first.

## Typed presets

```ts
import users, { type User, dataset } from "@apixa/mocking/data/users";
```

Root `datasets/` remains the full catalog. Presets under `@apixa/mocking/data/*` are small, typed, import-friendly slices (no large geography dumps).

## Global mock transport (compat)

```ts
import { createMockTransport } from "@apixa/mocking";
import { loadDataset } from "@apixa/mocking/node";

const transport = createMockTransport({
  dataset: await loadDataset("users-sample"),
});
```

## Node loaders

`listDatasets` / `loadDataset` live at `@apixa/mocking/node` (filesystem). Do not import `/node` in browser bundles.
