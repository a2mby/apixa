# Extend mock dataset types (agents)

Use this checklist for a built-in catalog change within an approved milestone. For application
records, use the public inline/provider `mock` syntax described in the [human guide](../humans/extend-mock-dataset-types.md).

1. Read `packages/core/src/types/mock-datasets.ts`: `MockDatasetCatalog` owns entity/id-key types;
   `MockDatasetIds` is derived from it. Core must not import Mocking.
2. Add the entity/catalog entry and Core's lightweight runtime id metadata in
   `packages/core/src/mock/datasets.ts`.
3. Add the JSON fixture and its lazy loader in `packages/mocking/src/catalog.ts`.
   Keep records out of initial chunks. A new public dataset subpath also requires the facade,
   export map, build entries and public API contract to agree.
4. Extend catalog/integrity tests under `tests/mocking/`. Update package documentation using
   `apixa/mocking` import paths. Only `examples/next` may be edited without a named exception.
5. Run `pnpm verify` and `graphify update .`. The single packed `apixa` must expose the intended
   types and load just the requested dataset. Update the export snapshot only for approved exports.
