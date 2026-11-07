# Extend mock dataset types

For application-specific records, use an inline array or a provider in `mock`; the record type
is inferred. No catalog extension or separate package installation is needed:

```ts
import { defineApi } from "apixa";
const api = defineApi({
  baseURL: "/api",
  resources: { pets: { path: "/pets", mock: [{ id: "1", name: "Rex" }] } },
});
const pets = await api.pets.getAll();
```

For built-in named datasets, import `apixa/mocking/register` before the first call. Records load
lazily. `MockDatasetCatalog` owns the built-in entity/id-key mapping; `MockDatasetIds` is a derived
type, not an open registry interface. The former `registerDatasetPreset` pattern is not implemented
by the current API.

To contribute a built-in dataset, follow the [agent checklist](../agents/extend-mock-dataset-types.md).
For paging, loading and individual dataset imports, see the [Mocking guide](../../../packages/mocking/README.md).
