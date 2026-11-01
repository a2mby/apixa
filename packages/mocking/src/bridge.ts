import { createFetchTransport, type DefineApiConfigBag, type Transport } from "@apixa/core";
import { ensureBuiltinPresets } from "./presets/builtins.js";
import { getDatasetPreset, listDatasetPresetIds } from "./presets/registry.js";
import { readSliceOption, type MockSlice } from "./slice.js";
import { buildStore, type MockStore } from "./store.js";
import { createSelectiveMockTransport } from "./transport.js";
import type { Dataset } from "./types.js";

const RESERVED = new Set(["baseURL", "headers", "transport", "timeout"]);

export type ResourceMockSpec = {
  name: string;
  path: string;
  type: string;
  slice?: MockSlice;
  pagination?: boolean;
};

type ResourceBag = {
  path?: string;
  mock?: unknown;
  /** Seed window — sibling of `path` / `mock` / `pagination`. */
  slice?: MockSlice;
  pagination?: boolean;
  mockConfig?: unknown;
  [key: string]: unknown;
};

function isResourceBag(value: unknown): value is ResourceBag {
  return Boolean(value && typeof value === "object" && "path" in (value as object));
}

const LEGACY_HINT = `Use mock: "<dataset-id>" (e.g. mock: "users-mock") and put pagination next to path / slice.`;

function resolveDataset(type: string): Dataset {
  ensureBuiltinPresets();
  const preset = getDatasetPreset(type);
  if (preset) return preset;
  const known = listDatasetPresetIds();
  throw new Error(
    `Unknown mock dataset "${type}". Register a preset (or import @apixa/mocking/data). ` +
      `Known presets: ${known.length ? known.join(", ") : "(none registered)"}. ` +
      `Full catalog ids live in datasets/manifest.json.`,
  );
}

function storeFromSpec(spec: ResourceMockSpec): MockStore {
  const dataset = resolveDataset(spec.type);
  return buildStore(dataset, {
    path: spec.path || dataset.meta.resource.path,
    slice: spec.slice,
    pagination: spec.pagination === true,
  });
}

/** Build selective Transport from explicit mock specs (Core lazy-load path). */
export function createSelectiveMockTransportFromSpecs(
  specs: ResourceMockSpec[],
  fallback: Transport,
): Transport {
  const stores = specs.map(storeFromSpec);
  return createSelectiveMockTransport({ stores, fallback });
}

/**
 * Apply resource `mock` (dataset id) on a defineApi config bag.
 * Strips mock keys and installs a selective Transport when any resource is mocked.
 */
export function applyResourceMocksToConfig(config: DefineApiConfigBag): DefineApiConfigBag {
  const stores: MockStore[] = [];
  const next: DefineApiConfigBag = { ...config };

  for (const [key, value] of Object.entries(config)) {
    if (RESERVED.has(key)) continue;
    if (!isResourceBag(value)) continue;

    const { mock, mockConfig, pagination, ...rest } = value;

    if (mockConfig != null) {
      throw new Error(`Resource "${key}" no longer supports mockConfig. ${LEGACY_HINT}`);
    }

    if (typeof mock === "boolean") {
      throw new Error(
        `Resource "${key}": mock must be a dataset id string, not ${mock}. ${LEGACY_HINT}`,
      );
    }

    if (typeof mock === "string") {
      if (!mock) {
        throw new Error(
          `Resource "${key}" has an empty mock id. Set mock: "<dataset-id>" (e.g. "users-mock").`,
        );
      }

      stores.push(
        storeFromSpec({
          name: key,
          path: typeof rest.path === "string" ? rest.path : "",
          type: mock,
          slice: readSliceOption(rest.slice, `Resource "${key}" slice`),
          pagination: pagination === true,
        }),
      );
      const { slice: _seedSlice, ...withoutSlice } = rest;
      next[key] = withoutSlice;
    } else if (mock != null) {
      throw new Error(
        `Resource "${key}": mock must be a dataset id string (got ${typeof mock}). ${LEGACY_HINT}`,
      );
    } else {
      next[key] = rest;
    }
  }

  if (stores.length === 0) {
    return next;
  }

  const fallback: Transport = config.transport ?? createFetchTransport();
  next.transport = createSelectiveMockTransport({ stores, fallback });
  return next;
}
