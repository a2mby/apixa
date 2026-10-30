import {
  isDatasetId,
  listDatasetIds,
  type DatasetId,
  type EntityOf,
  type IdKeyOf,
} from "./catalog.js";
import { MockApiError } from "./errors.js";
import { createResource, type MockResource } from "./resource.js";
import { assertSliceConfig, type MockSlice } from "./slice.js";

export type MockResourceConfig = {
  /** Dataset id from the catalog (`datasets/manifest.json`). */
  type: DatasetId;
  /**
   * Seed window: first N records, or half-open `{ start, end }` (Array.slice).
   * Overshooting the dataset returns all records. A seed limit, not a growth cap.
   */
  slice?: MockSlice;
  /** `getAll()` returns `{ data, total, page, pageSize }` and accepts `{ page, pageSize }`. */
  pagination?: boolean;
};

export type MockApiConfig = Record<string, MockResourceConfig>;

type PaginationOf<R> = R extends { readonly pagination: infer P } ? P : undefined;

export type MockApi<C extends MockApiConfig> = {
  [R in keyof C]: MockResource<
    EntityOf<C[R]["type"]>,
    IdKeyOf<C[R]["type"]>,
    PaginationOf<C[R]> & (boolean | undefined)
  >;
};

/** A generic constraint alone lets extra keys through; this makes e.g. `handlers` a type error. */
type Exact<C extends MockApiConfig> = {
  [R in keyof C]: { [K in Exclude<keyof C[R], keyof MockResourceConfig>]: never };
};

const OPTIONS = ["type", "slice", "pagination"];

function assertConfig(config: unknown): asserts config is MockApiConfig {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new MockApiError(
      "INVALID_CONFIG",
      'defineMockApi() expects an object of resources, e.g. { users: { type: "users-mock" } }.',
    );
  }
  const entries = Object.entries(config);
  if (entries.length === 0) {
    throw new MockApiError("INVALID_CONFIG", "defineMockApi() needs at least one resource.");
  }

  for (const [name, resource] of entries) {
    const label = `Mock resource "${name}"`;
    if (resource === null || typeof resource !== "object" || Array.isArray(resource)) {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label} must be an object like { type: "users-mock" }.`,
      );
    }
    for (const key of Object.keys(resource)) {
      if (!OPTIONS.includes(key)) {
        throw new MockApiError(
          "INVALID_CONFIG",
          `${label} has unsupported option "${key}". Supported options: ${OPTIONS.join(", ")}.`,
        );
      }
    }

    const { type, slice, pagination } = resource as Record<string, unknown>;
    if (!isDatasetId(type)) {
      throw new MockApiError(
        "UNKNOWN_DATASET",
        `${label}: ${type === undefined ? 'missing "type"' : `unknown dataset ${JSON.stringify(type)}`}. ` +
          `Available: ${listDatasetIds().join(", ")}.`,
      );
    }
    if (slice !== undefined) {
      assertSliceConfig(slice, label);
    }
    if (pagination !== undefined && typeof pagination !== "boolean") {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: pagination must be a boolean (got ${String(pagination)}).`,
      );
    }
  }
}

/**
 * Standalone, local mock API: each resource is seeded from a catalog dataset and keeps its
 * CRUD changes in memory. Performs no network requests and needs no `defineApi()`.
 * Every call gets its own isolated state; the source datasets are never mutated.
 *
 * @example
 * const mockApi = defineMockApi({
 *   users: { type: "users-mock", slice: 100, pagination: true },
 *   products: { type: "products-mock", slice: 50 },
 * });
 * const { data, total } = await mockApi.users.getAll({ page: 1, pageSize: 10 });
 */
export function defineMockApi<const C extends MockApiConfig>(config: C & Exact<C>): MockApi<C> {
  assertConfig(config);
  const api: Record<string, unknown> = {};
  for (const [name, resource] of Object.entries(config)) {
    api[name] = createResource(name, resource.type, resource);
  }
  return api as MockApi<C>;
}
