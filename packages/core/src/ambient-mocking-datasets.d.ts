/**
 * Ambient types for the optional `@apixa/mocking/datasets` peer entry. Core only needs the
 * loader signature; dataset ids and entity types are owned by Core (`MockDatasetCatalog`).
 */
declare module "@apixa/mocking/datasets" {
  export function loadDatasetRecords(id: string): Promise<readonly unknown[]>;
}
