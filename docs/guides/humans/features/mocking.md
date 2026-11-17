# Mocking

Status: **implemented**. `mock` supplies data. Operation behavior stays in `operations`. Mocking does not fall through to the network.

| Form                                 | Use it when                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `mock: [{ id: "1", name: "Ada" }]`   | The records belong to this app and should be checked when the client is built |
| `mock: () => import("./users.json")` | The records are large and should load on first use                            |
| `mock: "users-mock"`                 | You want a built-in catalog id, loaded on first use                           |
| `mock: { data, idKey, seed }`        | You also need an id key and a `seed` window (`limit`, `offset`)               |

```ts
import { defineApi } from "apixa";

const api = defineApi({
  baseURL: "/api",
  resources: {
    pets: { path: "/pets", mock: [{ id: "1", name: "Rex" }] },
  },
});

const pets = await api.pets.getAll();
```

All 13 built-ins run against that store. None of them calls another built-in. A custom operation that needs mock behavior sets its own `mock` handler on the operation.

Named catalog ids (`mock: "users-mock"`) come from `MockDatasetCatalog`. Import `apixa/mocking/register` before the first call. Application records do not need a catalog change: [Extend mock dataset types](../contributing/extend-mock-dataset-types.md).

Paging, loading, and dataset subpaths: [Mocking package README](../../../../packages/mocking/README.md). Rules that mock shares with live calls, including pagination limits: [conventions](../../../conventions.md#mocking-client-scoped-data-first).
