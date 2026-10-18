import {
  createFetchTransport,
  type DefineApiConfigBag,
  type Transport,
} from "@apixa/core";
import { ensureBuiltinPresets } from "./presets/builtins.js";
import { getDatasetPreset, listDatasetPresetIds } from "./presets/registry.js";
import { buildStore, type MockStore } from "./store.js";
import { createSelectiveMockTransport } from "./transport.js";
import type { Dataset } from "./types.js";

const RESERVED = new Set(["baseURL", "headers", "transport", "timeout"]);

export type ResourceMockSpec = {
  name: string;
  path: string;
  mockConfig: {
    type: string;
    size?: number;
    pagination?: boolean;
  };
};

type ResourceBag = {
  path?: string;
  mock?: boolean;
  mockConfig?: {
    type?: string;
    size?: number;
    pagination?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function isResourceBag(value: unknown): value is ResourceBag {
  return Boolean(value && typeof value === "object" && "path" in (value as object));
}

function resolveDataset(type: string): Dataset {
  ensureBuiltinPresets();
  const preset = getDatasetPreset(type);
  if (preset) return preset;
  const known = listDatasetPresetIds();
  throw new Error(
    `Unknown mockConfig.type "${type}". Import a typed preset from @apixa/mocking/data/* ` +
      `(or registerDatasetPreset). Known presets: ${known.length ? known.join(", ") : "(none registered)"}. ` +
      `Full catalog ids live in datasets/manifest.json.`,
  );
}

function storeFromSpec(spec: ResourceMockSpec): MockStore {
  const dataset = resolveDataset(spec.mockConfig.type);
  return buildStore(dataset, {
    path: spec.path || dataset.meta.resource.path,
    size: spec.mockConfig.size,
    pagination: spec.mockConfig.pagination === true,
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
 * Apply resource `mock` / `mockConfig` on a defineApi config bag.
 * Strips mock keys and installs a selective Transport when any resource is mocked.
 */
export function applyResourceMocksToConfig(config: DefineApiConfigBag): DefineApiConfigBag {
  const stores: MockStore[] = [];
  const next: DefineApiConfigBag = { ...config };

  for (const [key, value] of Object.entries(config)) {
    if (RESERVED.has(key)) continue;
    if (!isResourceBag(value)) continue;

    const { mock, mockConfig, ...rest } = value;

    if (mock === true) {
      if (!mockConfig || typeof mockConfig.type !== "string" || !mockConfig.type) {
        throw new Error(
          `Resource "${key}" has mock: true but mockConfig.type is missing. ` +
            `Set mockConfig: { type: "<dataset-id>" } (e.g. "users-sample").`,
        );
      }

      stores.push(
        storeFromSpec({
          name: key,
          path: typeof rest.path === "string" ? rest.path : "",
          mockConfig: {
            type: mockConfig.type,
            size: typeof mockConfig.size === "number" ? mockConfig.size : undefined,
            pagination: mockConfig.pagination === true,
          },
        }),
      );
    } else if (mockConfig != null) {
      throw new Error(
        `Resource "${key}" has mockConfig but mock is not true. Set mock: true to enable mocking.`,
      );
    }

    next[key] = rest;
  }

  if (stores.length === 0) {
    return next;
  }

  const fallback: Transport = config.transport ?? createFetchTransport();
  next.transport = createSelectiveMockTransport({ stores, fallback });
  return next;
}
