/**
 * Node-only dataset loaders (uses `node:fs`).
 * Prefer `@apixa/mocking` in browsers / Next client components.
 */
export type {
  Dataset,
  DatasetFieldSchema,
  DatasetListItem,
  DatasetMeta,
  DatasetResourceHint,
  DatasetSchema,
} from "./types.js";

export { loadDataset, type LoadDatasetOptions } from "./load.js";
export { listDatasets, getDataset, type ListDatasetsOptions } from "./registry.js";
export { findDatasetDirs, resolveDatasetDir } from "./discover.js";
export {
  createMockTransport,
  type CreateMockTransportOptions,
} from "./transport.js";
