import { catalog, isDatasetId } from "./catalog.js";

/**
 * Lazy dataset loader used by `@apixa/core` for `mock: "<dataset-id>"`. Only the requested
 * dataset's JSON module is imported; nothing is registered globally.
 */
export async function loadDatasetRecords(id: string): Promise<readonly unknown[]> {
  if (!isDatasetId(id)) throw new Error(`Unknown mock dataset "${id}".`);
  return (await catalog[id].load()).default;
}
