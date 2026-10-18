import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { findDatasetDirs } from "./discover.js";
import { loadDataset, type LoadDatasetOptions } from "./load.js";
import { resolveDatasetsRoot } from "./paths.js";
import type { Dataset, DatasetListItem, DatasetMeta } from "./types.js";

export type ListDatasetsOptions = LoadDatasetOptions;

/**
 * List local datasets under the datasets root (no network).
 * Walks domain folders; each leaf with `meta.json` is a dataset.
 */
export async function listDatasets(
  options: ListDatasetsOptions = {},
): Promise<DatasetListItem[]> {
  const root = resolveDatasetsRoot(options.basePath);
  let dirs: string[];
  try {
    dirs = await findDatasetDirs(root);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list datasets in ${root}: ${reason}`);
  }

  const items: DatasetListItem[] = [];

  for (const dir of dirs) {
    try {
      const raw = await readFile(join(dir, "meta.json"), "utf8");
      const meta = JSON.parse(raw) as Partial<DatasetMeta>;
      if (typeof meta.id !== "string" || typeof meta.title !== "string") continue;
      const rel = relative(root, dir).replace(/\\/g, "/");
      items.push({
        id: meta.id,
        title: meta.title,
        description: meta.description,
        license: typeof meta.license === "string" ? meta.license : "unknown",
        version: typeof meta.version === "string" ? meta.version : "0.0.0",
        records: typeof meta.records === "number" ? meta.records : 0,
        resourcePath:
          meta.resource && typeof meta.resource.path === "string" ? meta.resource.path : "",
        path: rel,
      });
    } catch {
      // Skip folders without readable meta.
    }
  }

  return items.sort((a, b) => a.id.localeCompare(b.id));
}

/** Load one dataset by id (registry entry → full dataset). */
export async function getDataset(id: string, options: LoadDatasetOptions = {}): Promise<Dataset> {
  return loadDataset(id, options);
}
