import {
  createFetchTransport,
  type DefineApiConfigBag,
  type DefineApiProcessor,
  type Transport,
} from "@apixa/core";
import { getDatasetPreset, listDatasetPresetIds } from "./presets/registry.js";
import { buildStore, type MockStore } from "./store.js";
import { createSelectiveMockTransport } from "./transport.js";
import type { Dataset } from "./types.js";

const RESERVED = new Set(["baseURL", "headers", "transport", "timeout"]);

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
  const preset = getDatasetPreset(type);
  if (preset) return preset;
  const known = listDatasetPresetIds();
  throw new Error(
    `Unknown mockConfig.type "${type}". Import a typed preset from @apixa/mocking/data/* ` +
      `(or registerDatasetPreset). Known presets: ${known.length ? known.join(", ") : "(none registered)"}. ` +
      `Full catalog ids live in datasets/manifest.json.`,
  );
}

/**
 * Core defineApi processor: resource `mock` / `mockConfig` → selective Transport.
 * Strips mock keys so Core never treats them as HTTP options.
 */
export const resourceMockProcessor: DefineApiProcessor = (config) => {
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

      const dataset = resolveDataset(mockConfig.type);
      stores.push(
        buildStore(dataset, {
          path: typeof rest.path === "string" ? rest.path : dataset.meta.resource.path,
          size: typeof mockConfig.size === "number" ? mockConfig.size : undefined,
          pagination: mockConfig.pagination === true,
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
};
