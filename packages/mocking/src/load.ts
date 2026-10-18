import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDatasetDir } from "./discover.js";
import { resolveDatasetsRoot } from "./paths.js";
import type { Dataset, DatasetMeta } from "./types.js";

export interface LoadDatasetOptions {
  /** Absolute or relative path to the datasets root (folders named by dataset id). */
  basePath?: string;
}

function assertMeta(value: unknown, id: string): DatasetMeta {
  if (!value || typeof value !== "object") {
    throw new Error(`Dataset "${id}" meta.json is not an object`);
  }

  const meta = value as Partial<DatasetMeta>;
  if (typeof meta.id !== "string" || !meta.id) {
    throw new Error(`Dataset "${id}" meta.json is missing id`);
  }
  if (typeof meta.title !== "string" || !meta.title) {
    throw new Error(`Dataset "${id}" meta.json is missing title`);
  }
  if (typeof meta.license !== "string" || !meta.license) {
    throw new Error(`Dataset "${id}" meta.json is missing license`);
  }
  if (typeof meta.version !== "string" || !meta.version) {
    throw new Error(`Dataset "${id}" meta.json is missing version`);
  }
  if (!meta.resource || typeof meta.resource.path !== "string" || !meta.resource.path) {
    throw new Error(`Dataset "${id}" meta.json is missing resource.path`);
  }
  if (!meta.schema || !Array.isArray(meta.schema.fields)) {
    throw new Error(`Dataset "${id}" meta.json is missing schema.fields`);
  }

  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    license: meta.license,
    version: meta.version,
    resource: {
      path: meta.resource.path,
      idField: meta.resource.idField,
    },
    schema: { fields: meta.schema.fields },
    records: typeof meta.records === "number" ? meta.records : 0,
  };
}

/**
 * Load a local dataset by id (`datasets/<domain>/<id>/meta.json` + `data.json`).
 * `id` may be the meta.id or a relative path under the datasets root.
 * Node-friendly; browsers should import JSON and pass it to `createMockTransport`.
 */
export async function loadDataset(id: string, options: LoadDatasetOptions = {}): Promise<Dataset> {
  const root = resolveDatasetsRoot(options.basePath);
  const dir = await resolveDatasetDir(root, id);
  if (!dir) {
    throw new Error(`Failed to load dataset "${id}": not found under ${root}`);
  }

  let metaRaw: string;
  let dataRaw: string;
  try {
    metaRaw = await readFile(join(dir, "meta.json"), "utf8");
    dataRaw = await readFile(join(dir, "data.json"), "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load dataset "${id}" from ${dir}: ${reason}`);
  }

  const meta = assertMeta(JSON.parse(metaRaw) as unknown, id);

  const parsed = JSON.parse(dataRaw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Dataset "${id}" data.json must be a JSON array`);
  }

  const records = parsed as Record<string, unknown>[];
  return {
    meta: { ...meta, records: records.length },
    records,
  };
}
