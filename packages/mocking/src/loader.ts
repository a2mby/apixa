import { catalog, isDatasetId, listDatasetIds, type DatasetId, type EntityOf } from "./catalog.js";
import { MockApiError } from "./errors.js";

/**
 * Lazy dataset loader used by `@apixa/core` for `mock: "<dataset-id>"` (via `./register`). Only
 * the requested dataset's JSON module is imported; nothing is registered globally. Kept free of
 * the eager record exports so registering never loads a dataset by itself.
 */
export async function loadDatasetRecords(id: string): Promise<readonly unknown[]> {
  if (!isDatasetId(id)) throw new Error(`Unknown mock dataset "${id}".`);
  return (await catalog[id].load()).default;
}

/**
 * Load one catalog dataset's records on demand. Nothing is read until you call it, and only
 * the selected dataset is imported. The result is the module-cached array shared by every
 * caller: treat it as read-only (stores made by `defineMockApi` always copy).
 *
 * @example
 * const users = await loadDataset("users-mock"); // readonly MockUser[]
 */
export async function loadDataset<K extends DatasetId>(id: K): Promise<readonly EntityOf<K>[]> {
  if (!isDatasetId(id)) {
    throw new MockApiError(
      "UNKNOWN_DATASET",
      `Unknown dataset ${JSON.stringify(id)}. Available: ${listDatasetIds().join(", ")}.`,
    );
  }
  return (await catalog[id].load()).default as readonly EntityOf<K>[];
}
